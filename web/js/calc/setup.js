import {
  GRADES, GRADE_KO, KINDS, tableFor, partCode, makePredicate, conditionProbability, expectedPotential, resetCost,
} from "./potential.js";

const normalize = (text) => String(text ?? "").replace(/\s/g, "").toLowerCase();

export function matchSetup(text, setups) {
  const input = normalize(text);
  let best = null, count = 0;
  for (const setup of setups || []) {
    const hits = setup.keywords.filter((word) => normalize(word) && input.includes(normalize(word))).length;
    if (hits > count) { best = setup; count = hits; }
  }
  return best;
}

export function setupPlan({ items = [], tables, meta, setup, minLines = 1, kind = "main", mainStat = "STR" }) {
  if (!["main", "additional"].includes(kind) || !Number.isInteger(minLines) || minLines < 1 || minLines > 3
      || !setup?.kinds?.length || setup.kinds.some((k) => !KINDS[k])) throw new Error("세팅 조건을 확인하세요.");
  const cond = { mode: "lines", kinds: setup.kinds, min: minLines, stat: mainStat, atk: mainStat === "INT" ? "마력" : "공격력" };
  const predicate = makePredicate(cond);
  const prefix = kind === "main" ? "potential" : "additional_potential";
  const plan = { done: [], todo: [], impossible: [], nextSteps: [] };
  // 같은 부위·레벨·등급은 계산 결과를 재사용합니다 (반지 등).
  const probabilities = new Map();
  for (const item of items) {
    const slot = item.item_equipment_slot || item.item_equipment_part || item.item_name || "부위 미상";
    const gradeValue = item[`${prefix}_option_grade`];
    const grade = GRADE_KO[gradeValue] || (GRADES.includes(gradeValue) ? gradeValue : null);
    const options = [1, 2, 3].map((n) => String(item[`${prefix}_option_${n}`] || ""));
    // API의 '옵션 : +수치' 표기를 확률표의 '옵션 +수치'로 맞춥니다.
    const current = options.map((s) => s.replace(/\s*:\s*/g, " ").trim());
    const row = { slot, item, options, grade, targetGrade: null, probability: null, attempts: null, meso: null, availableKinds: [], higherGrade: false };
    const finish = (status, note) => { row.status = status; row.note = note; plan[status].push(row); };
    if (predicate(current)) { row.attempts = 0; row.meso = 0; finish("done", "충족"); continue; }
    const code = partCode(tables, item), level = Number(item.item_level);
    let hasTable = false, hasOption = false, target = null;
    for (const g of GRADES) {
      const lines = tableFor(tables, kind, g, code, level);
      if (!lines) continue;
      hasTable = true;
      const availableKinds = setup.kinds.filter((k) => lines.some((line) => line.some(([name, p]) => p > 0 && KINDS[k].value(name, cond) > 0)));
      if (!availableKinds.length) continue;
      hasOption = true;
      if (grade && GRADES.indexOf(g) < GRADES.indexOf(grade)) continue;
      const key = `${g}|${code}|${level}`;
      if (!probabilities.has(key)) probabilities.set(key, conditionProbability(lines, predicate, meta.exclusive));
      const probability = probabilities.get(key);
      if (probability > 0) { target = { g, probability, availableKinds }; break; }
    }
    if (!hasTable) { finish("impossible", "잠재능력 확률표가 없는 부위"); continue; }
    if (!hasOption) { finish("impossible", "확률표의 어느 등급에서도 해당 옵션이 나오지 않음"); continue; }
    if (!target) { finish("impossible", "이 줄 수 조건은 현재·상위 등급에서 달성 불가"); continue; }
    row.targetGrade = target.g;
    row.availableKinds = target.availableKinds;
    row.higherGrade = !!grade && GRADES.indexOf(target.g) > GRADES.indexOf(grade);
    if (!grade) { finish("todo", "잠재능력을 먼저 부여하세요 (등급 없음·비용 계산 불가)"); continue; }
    row.probability = target.probability;
    // 비용 누락을 0메소로 계산하지 않습니다. 횟수는 비용과 독립적으로 표시합니다.
    const from = GRADES.indexOf(grade), to = GRADES.indexOf(target.g);
    const steps = GRADES.slice(from, to);
    if (steps.some((g) => !meta.tier?.[kind]?.[g])) { finish("todo", "등급 상승 메타 없음"); continue; }
    const expected = expectedPotential(meta, { kind, level, fromGrade: grade, toGrade: target.g, optionProb: target.probability });
    row.attempts = Number.isFinite(expected.attempts) ? expected.attempts : null;
    const costsKnown = [...steps, target.g].every((g) => resetCost(meta, kind, level, g) != null);
    row.meso = costsKnown && Number.isFinite(expected.meso) ? expected.meso : null;
    finish("todo", row.higherGrade ? "현재 등급 불가 · 상위 등급에서 가능" : "작업 필요");
  }
  plan.todo.sort((a, b) => (b.probability ?? -1) - (a.probability ?? -1) || (a.meso ?? Infinity) - (b.meso ?? Infinity));
  plan.nextSteps = plan.todo.map((row) => ({ slot: row.slot, text: row.probability == null ? row.note
    : `${row.higherGrade ? `${meta.grade_names[row.targetGrade]}로 등급 상승 후 ` : ""}${row.availableKinds.map((k) => KINDS[k].label).join(" / ")} 중 ${minLines}줄 이상 재설정` }));
  return plan;
}
