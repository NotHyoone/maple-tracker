// 목표 탭의 잠재능력 목표: 장비·윗잠/에디·목표 등급·옵션 조건 → 확률, 평균 재설정 횟수, 메소
import { esc, fmtNum, fmtInt } from "./format.js";
import { equipmentSteps } from "./roadmap.js";
import {
  GRADES, GRADE_KO, KINDS, tableFor, partCode, conditionProbability, makePredicate, expectedPotential, potentialQuantiles,
} from "./calc/potential.js";

const KIND_KO = { main: "잠재능력", additional: "에디셔널 잠재능력" };

/** 옵션 조건 프리셋 → 계산용 조건 */
export const CONDITIONS = {
  none: { label: "옵션 조건 없음 (등급만)", unit: "" },
  stat: { label: "주스탯 % 합계 (올스탯 포함)", unit: "%", make: (g) => ({ mode: "sum", kind: "stat", stat: g.stat, min: g.min }) },
  atk: { label: "공격력/마력 % 합계", unit: "%", make: (g) => ({ mode: "sum", kind: "atk", atk: g.atk, min: g.min }) },
  wse: { label: "공·마% / 보공 / 방무 유효 줄 수", unit: "줄", make: (g) => ({ mode: "lines", kinds: ["atk", "boss", "ied"], atk: g.atk, min: g.min }) },
  boss: { label: "보스 데미지 합계", unit: "%", make: (g) => ({ mode: "sum", kind: "boss", min: g.min }) },
  critdmg: { label: "크리티컬 데미지 합계", unit: "%", make: (g) => ({ mode: "sum", kind: "critdmg", min: g.min }) },
  cooldown: { label: "스킬 재사용 대기시간 감소", unit: "초", make: (g) => ({ mode: "sum", kind: "cooldown", min: g.min }) },
  drop: { label: "아이템 드롭률 합계", unit: "%", make: (g) => ({ mode: "sum", kind: "drop", min: g.min }) },
  meso: { label: "메소 획득량 합계", unit: "%", make: (g) => ({ mode: "sum", kind: "meso", min: g.min }) },
  dropmeso: { label: "드롭률·메획 유효 줄 수", unit: "줄", make: (g) => ({ mode: "lines", kinds: ["drop", "meso"], min: g.min }) },
};

export function condText(g) {
  const c = CONDITIONS[g.cond] || CONDITIONS.none;
  if (!c.make) return "";
  if (g.cond === "wse") return `${g.atk}%·보공·방무 ${g.min}줄 이상`;
  if (g.cond === "dropmeso") return `드롭률·메획 ${g.min}줄 이상`;
  const who = g.cond === "stat" ? `${g.stat} ` : ["atk", "wse"].includes(g.cond) ? `${g.atk} ` : "";
  return `${who}${c.label.replace(/ \(.*\)$/, "")} ${g.min}${c.unit} 이상`;
}

export function potentialItems(c, tables) {
  return (c.item || []).filter((it) => it.item_level > 0 && partCode(tables, it) != null);
}

/** 캐릭터의 주스탯 추정 (스탯 중 가장 높은 것) */
export function guessMainStat(c) {
  const st = c.stat || {};
  const best = ["STR", "DEX", "INT", "LUK"].map((k) => [k, Number(st[k]) || 0]).sort((a, b) => b[1] - a[1])[0];
  return best?.[1] ? best[0] : "STR";
}

const pct = (v) => (v >= 0.9995 ? "100%" : v < 0.00001 ? "0.001% 미만" : `${(v * 100).toFixed(v < 0.001 ? 4 : 3)}%`);

export function potentialResult(goal, c, ctx) {
  const tables = ctx.rules.potential, meta = ctx.rules.potentialMeta;
  const it = (c.item || []).find((x) => x.item_equipment_slot === goal.slot);
  if (!it) return { steps: [], html: `<p class="muted">${esc(goal.slot)} 부위 장비를 찾을 수 없습니다.</p>` };
  const kind = goal.potKind || "main";
  const gradeKey = kind === "main" ? "potential_option_grade" : "additional_potential_option_grade";
  const optKeys = kind === "main" ? ["potential_option_1", "potential_option_2", "potential_option_3"]
    : ["additional_potential_option_1", "additional_potential_option_2", "additional_potential_option_3"];
  const curGrade = GRADE_KO[it[gradeKey]] || null;
  const curLines = optKeys.map((k) => it[k]).filter(Boolean);
  const target = goal.toGrade || "legendary";
  const ko = meta.grade_names;
  const roadmap = equipmentSteps("pot", goal.slot,
    `${goal.slot} ${KIND_KO[kind]} ${ko[target]}${goal.cond && goal.cond !== "none" ? ` · ${condText(goal)}` : ""} 달성`, false, curGrade ? false : null);

  const head = `${esc(it.item_name)} <span class="sub">${esc(it.item_equipment_slot)} · Lv.${esc(it.item_level)} · ${KIND_KO[kind]}</span><br>` +
    `${curGrade ? esc(ko[curGrade]) : "잠재능력 없음"} → <b>${esc(ko[target])}</b>${goal.cond && goal.cond !== "none" ? ` + ${esc(condText(goal))}` : ""}` +
    (curLines.length ? `<p class="muted">현재: ${esc(curLines.join(" / "))}</p>` : "");
  if (!curGrade) return { steps: roadmap, html: head + '<p class="muted">잠재능력이 없는 장비는 먼저 잠재능력을 부여해야 해서 계산하지 않습니다.</p>' };

  const fromIdx = GRADES.indexOf(curGrade), toIdx = GRADES.indexOf(target);
  const cond = CONDITIONS[goal.cond]?.make?.(goal) || null;
  const predicate = cond ? makePredicate(cond) : null;
  if (fromIdx >= toIdx && (!predicate || (fromIdx === toIdx && predicate(curLines)))) {
    return { steps: [], html: `${head}<p class="good">이미 달성했습니다 🎉</p>` };
  }

  let optionProb = null;
  const optGrade = GRADES[Math.max(fromIdx, toIdx)];
  if (predicate) {
    const lines = tableFor(tables, kind, optGrade, partCode(tables, it), it.item_level);
    if (!lines) {
      return { steps: roadmap, html: head + `<p class="muted">이 장비(부위·레벨)의 ${esc(ko[optGrade])} 옵션 확률표가 없습니다. 장비를 바꿨다면 <code>python -m collector.fetch_potential</code>을 다시 실행하세요.</p>` };
    }
    optionProb = conditionProbability(lines, predicate, meta.exclusive);
    if (optionProb <= 0) return { steps: [], html: head + '<p class="err">이 부위·등급에서는 나올 수 없는 조건입니다.</p>' };
  }
  const p = { kind, level: Number(it.item_level), fromGrade: curGrade, toGrade: GRADES[Math.max(fromIdx, toIdx)], optionProb };
  const e = expectedPotential(meta, p);
  const q = potentialQuantiles(meta, p);

  const steps = e.tierSteps.map((t) => `<li><span>${esc(ko[t.grade])} → ${esc(ko[GRADES[GRADES.indexOf(t.grade) + 1]])}<br><span class="sub">확률 ${pct(t.rate)} · 천장 ${t.ceiling}회</span></span>` +
    `<span class="r">평균 ${t.attempts.toFixed(1)}회<br>${fmtNum(t.attempts * t.cost)}</span></li>`).join("");
  const opt = optionProb != null
    ? `<li><span>${esc(condText(goal))}<br><span class="sub">1회 확률 ${pct(optionProb)}</span></span><span class="r">평균 ${fmtInt(e.optionAttempts)}회<br>${fmtNum(e.optionAttempts * e.optCost)}</span></li>` : "";
  const html = head +
    `<div class="kv"><div><span>평균 재설정 횟수</span><b>${fmtInt(e.attempts)}회</b></div><div><span>평균 메소</span><b>${fmtNum(e.meso)}</b></div></div>` +
    `<ul class="list">${steps}${opt}</ul>` +
    (q ? `<h3>운에 따른 비용</h3><div class="kv"><div><span>운 좋음 (상위 10%)</span><b>${fmtNum(q.p10)}</b></div><div><span>보통 (중간값)</span><b>${fmtNum(q.p50)}</b></div>` +
      `<div><span>운 나쁨 (하위 10%)</span><b>${fmtNum(q.p90)}</b></div><div><span>최악 1%</span><b>${fmtNum(q.p99)}</b></div></div>` : "") +
    '<p class="muted">메소 재설정 기준. 등급 상승 확률·천장·비용과 줄별 옵션 확률은 넥슨 공식 확률 공개 자료' +
    (kind === "additional" ? "(에디셔널 재설정 비용만 계산기 출처 1곳)" : "") +
    '입니다. 등급이 오르는 순간의 옵션과 "이전과 같은 결과는 다시 뽑음" 규칙은 무시한 근사입니다.</p>';
  return { steps: roadmap, html, hasMeso: true, meso: e.meso, partial: false, mesoLabel: `${KIND_KO[kind]} 평균 비용` };
}

export function potentialFormFields(c, tables) {
  const items = potentialItems(c, tables);
  const itemOpts = items.map((it) => `<option value="${esc(it.item_equipment_slot)}">${esc(it.item_equipment_slot)} · ${esc(it.item_name)} (${esc(it.potential_option_grade || "없음")}/${esc(it.additional_potential_option_grade || "없음")})</option>`).join("");
  const condOpts = Object.entries(CONDITIONS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join("");
  const main = guessMainStat(c);
  const statOpts = ["STR", "DEX", "INT", "LUK", "최대 HP"].map((s) => `<option${s === main ? " selected" : ""}>${s}</option>`).join("");
  const atkDefault = main === "INT" ? "마력" : "공격력";
  return `<label data-for="potential" hidden>장비 <select name="potSlot">${itemOpts}</select></label>
<fieldset data-for="potential" hidden class="sf-opts"><legend>잠재능력 조건</legend>
<label>종류 <select name="potKind"><option value="main">잠재능력 (윗잠)</option><option value="additional">에디셔널 잠재능력</option></select></label>
<label>목표 등급 <select name="toGrade"><option value="legendary">레전드리</option><option value="unique">유니크</option><option value="epic">에픽</option></select></label>
<label>옵션 조건 <select name="cond">${condOpts}</select></label>
<label data-cond="stat">주스탯 <select name="stat">${statOpts}</select></label>
<label data-cond="atk">공격력/마력 <select name="atk"><option${atkDefault === "공격력" ? " selected" : ""}>공격력</option><option${atkDefault === "마력" ? " selected" : ""}>마력</option></select></label>
<label data-cond="min">기준값 <span class="sub" data-unit></span><input name="min" type="number" inputmode="numeric" min="1" step="1" placeholder="예: 30"></label>
</fieldset>`;
}

/** 조건 종류에 따라 주스탯/공마/기준값 칸 보이기 */
export function syncPotentialFields(f) {
  const cond = f.cond?.value;
  if (!cond) return;
  const show = { stat: cond === "stat", atk: ["atk", "wse"].includes(cond), min: cond !== "none" };
  f.querySelectorAll("[data-cond]").forEach((el) => { el.hidden = f.type.value !== "potential" || !show[el.dataset.cond]; });
  const unit = f.querySelector("[data-unit]");
  if (unit) unit.textContent = CONDITIONS[cond].unit ? `(${CONDITIONS[cond].unit})` : "";
}

export function readPotentialForm(f) {
  return {
    slot: f.potSlot.value, potKind: f.potKind.value, toGrade: f.toGrade.value, cond: f.cond.value,
    stat: f.stat.value, atk: f.atk.value, min: Number(f.min.value) || 0,
  };
}
