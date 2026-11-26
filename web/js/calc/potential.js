// 잠재능력 재설정 기댓값. tables = rules/potential.json, meta = rules/potential_meta.json
//
// 1회 재설정 = (등급이 목표보다 낮으면) 등급 상승 시도 + 세 줄 옵션 재설정.
// 줄 옵션 확률은 공식 표(줄별 표기 확률)를 쓰고, 공식 '중복 제한' 규칙을 반영합니다:
//   제한 옵션이 앞 줄에서 한도만큼 나오면 다음 줄에서 그 계열을 빼고 표기확률/(1-빠진 확률 합)으로 다시 계산.

export const GRADES = ["rare", "epic", "unique", "legendary"];
export const GRADE_KO = { 레어: "rare", 에픽: "epic", 유니크: "unique", 레전드리: "legendary" };

export function levelBracket(meta, level) {
  return meta.level_brackets.find(([max]) => level <= max)?.[1] ?? meta.level_brackets.at(-1)[1];
}

export function resetCost(meta, kind, level, grade) {
  return meta.cost[kind]?.[levelBracket(meta, level)]?.[grade] ?? null;
}

/** 장비 → 줄별 표 [[ [옵션, 확률] ... ] x3] 또는 null */
export function tableFor(tables, kind, grade, partCode, level) {
  const h = tables.index[`${kind}|${grade}|${partCode}|${Math.min(Number(level), 250)}`];
  return h ? tables.tables[h] : null;
}

export function partCode(tables, item) {
  const parts = tables.parts || {};
  const slot = String(item.item_equipment_slot || "").replace(/\d+$/, "");
  return parts[item.item_equipment_part] ?? parts[slot] ?? null;
}

// ---------- 옵션 값 읽기 ----------

const ESC = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 조건 종류별: 옵션 이름 → 수치(해당 없으면 0) */
export const KINDS = {
  stat: { label: "주스탯 %", unit: "%", value: (name, o) => {
    const st = o.stat || "STR";
    const m = name.match(new RegExp(`^${ESC(st)} \\+(\\d+)%$`)) || (st !== "최대 HP" && name.match(/^올스탯 \+(\d+)%$/));
    return m ? Number(m[1]) : 0;
  } },
  atk: { label: "공격력/마력 %", unit: "%", value: (name, o) => {
    const m = name.match(new RegExp(`^${ESC(o.atk || "공격력")} \\+(\\d+)%$`));
    return m ? Number(m[1]) : 0;
  } },
  boss: { label: "보스 몬스터 데미지", unit: "%", value: (n) => Number(n.match(/^보스 몬스터 데미지 \+(\d+)%$/)?.[1] || 0) },
  ied: { label: "몬스터 방어율 무시", unit: "%", value: (n) => Number(n.match(/^몬스터 방어율 무시 \+(\d+)%$/)?.[1] || 0) },
  damage: { label: "데미지 %", unit: "%", value: (n) => Number(n.match(/^데미지 \+(\d+)%$/)?.[1] || 0) },
  critdmg: { label: "크리티컬 데미지", unit: "%", value: (n) => Number(n.match(/^크리티컬 데미지 \+(\d+)%$/)?.[1] || 0) },
  cooldown: { label: "스킬 재사용 대기시간 감소", unit: "초", value: (n) => Number(n.match(/재사용 대기시간 -(\d+)초$/)?.[1] || 0) },
  drop: { label: "아이템 드롭률", unit: "%", value: (n) => Number(n.match(/^아이템 드롭률 \+(\d+)%$/)?.[1] || 0) },
  meso: { label: "메소 획득량", unit: "%", value: (n) => Number(n.match(/^메소 획득량 \+(\d+)%$/)?.[1] || 0) },
};

/**
 * 조건 → (세 줄 옵션 이름 배열) => boolean
 *  {mode:"sum", kind, min, stat?, atk?}     : 해당 종류 수치 합 ≥ min
 *  {mode:"lines", kinds:[...], min, stat?, atk?} : 고른 종류 중 하나라도 해당하는 줄 수 ≥ min
 */
export function makePredicate(cond) {
  if (cond.mode === "lines") {
    const ks = cond.kinds.map((k) => KINDS[k]);
    return (names) => names.filter((n) => ks.some((k) => k.value(n, cond) > 0)).length >= cond.min;
  }
  const k = KINDS[cond.kind];
  return (names) => names.reduce((s, n) => s + k.value(n, cond), 0) >= cond.min;
}

// ---------- 정확한 확률 (세 줄 모두 나열) ----------

function categoryOf(name, rules) {
  for (const [limit, pats] of [[1, rules.max1], [2, rules.max2]]) {
    for (const p of pats) if (new RegExp(p).test(name)) return { key: p, limit };
  }
  return null;
}

/** 한 번 재설정했을 때 조건을 만족할 확률 */
export function conditionProbability(lines, predicate, exclusive) {
  const rules = exclusive || { max1: [], max2: [] };
  const cats = lines.map((line) => line.map(([n]) => categoryOf(n, rules)));
  let total = 0;
  const pick = (li, chosen, counts, prob) => {
    if (li === 3) { if (predicate(chosen)) total += prob; return; }
    const line = lines[li];
    // 이 줄에서 빠지는 옵션(한도에 다다른 계열)
    let excluded = 0;
    const allowed = line.map(([, p], i) => {
      const c = cats[li][i];
      const ok = !c || (counts[c.key] || 0) < c.limit;
      if (!ok) excluded += p;
      return ok;
    });
    const norm = 1 - excluded;
    if (norm <= 0) return;
    line.forEach(([name, p], i) => {
      if (!allowed[i] || p <= 0) return;
      const c = cats[li][i];
      const next = c ? { ...counts, [c.key]: (counts[c.key] || 0) + 1 } : counts;
      pick(li + 1, [...chosen, name], next, prob * (p / norm));
    });
  };
  pick(0, [], {}, 1);
  return total;
}

// ---------- 등급 상승 + 옵션 → 시도 횟수와 메소 ----------

/** 천장이 있는 등급 상승 한 단계의 평균 시도 수 */
export function tierAttempts(rate, ceiling) {
  return ceiling ? (1 - (1 - rate) ** ceiling) / rate : 1 / rate;
}

/**
 * p = {kind:"main"|"additional", level, fromGrade, toGrade, optionProb (목표 등급에서 조건 확률, 없으면 null)}
 * 반환 {tierSteps:[{grade, rate, ceiling, attempts, cost}], optionAttempts, meso, attempts}
 */
export function expectedPotential(meta, p) {
  const from = GRADES.indexOf(p.fromGrade), to = GRADES.indexOf(p.toGrade);
  const tierSteps = [];
  for (let g = from; g < to; g++) {
    const grade = GRADES[g], t = meta.tier[p.kind][grade];
    const attempts = tierAttempts(t.rate, t.ceiling);
    tierSteps.push({ grade, rate: t.rate, ceiling: t.ceiling, attempts, cost: resetCost(meta, p.kind, p.level, grade) });
  }
  const optGrade = GRADES[Math.max(from, to)];
  const optionAttempts = p.optionProb == null ? 0 : p.optionProb > 0 ? 1 / p.optionProb : Infinity;
  const optCost = resetCost(meta, p.kind, p.level, optGrade);
  const meso = tierSteps.reduce((s, t) => s + t.attempts * t.cost, 0) + optionAttempts * optCost;
  const attempts = tierSteps.reduce((s, t) => s + t.attempts, 0) + optionAttempts;
  return { tierSteps, optionAttempts, optCost, meso, attempts };
}

/** 메소 분포 (모의 시행: 등급 상승은 천장 있는 기하분포, 옵션은 기하분포) */
export function potentialQuantiles(meta, p, { runs = 20000, random = Math.random } = {}) {
  const e = expectedPotential(meta, p);
  if (!Number.isFinite(e.meso)) return null;
  const geo = (rate) => (rate >= 1 ? 1 : Math.max(1, Math.ceil(Math.log(1 - random()) / Math.log(1 - rate))));
  const out = new Float64Array(runs);
  for (let r = 0; r < runs; r++) {
    let m = 0;
    for (const t of e.tierSteps) m += Math.min(geo(t.rate), t.ceiling || Infinity) * t.cost;
    if (p.optionProb != null) m += geo(p.optionProb) * e.optCost;
    out[r] = m;
  }
  out.sort();
  const q = (x) => out[Math.min(runs - 1, Math.floor(x * runs))];
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9), p99: q(0.99) };
}
