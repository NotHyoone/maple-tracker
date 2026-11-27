// 목표 결과를 체크리스트로 변환합니다. DOM·저장소에 의존하지 않습니다.
import { remainingExp } from "./calc/level.js";
import { fmtNum, fmtInt } from "./format.js";

export function levelSteps(current, target, table = new Map()) {
  const level = Number(current.level);
  target = Number(target);
  if (!Number.isInteger(level) || !Number.isInteger(target) || level < 1 || target > 300 || target <= level) return [];
  const milestones = [];
  for (let lv = (Math.floor(level / 5) + 1) * 5; lv < target; lv += 5) milestones.push(lv);
  milestones.push(target);
  let from = current;
  return milestones.map((lv) => {
    const { remaining } = remainingExp(from, lv, table);
    const step = { id: `lv-${lv}`, label: `Lv.${lv} 달성`, auto: level >= lv };
    if (remaining != null) step.detail = `Lv.${from.level} → ${lv} 필요 경험치 ${fmtNum(remaining)}`;
    from = { level: lv, exp: 0 };
    return step;
  });
}

const knownCost = (value) => Number.isFinite(value) && value >= 0 ? value : Infinity;

// rows는 기존 symbolGoal / hexaGoal 계산 결과를 그대로 사용합니다.
export function symbolSteps(rows, target) {
  return rows.filter(({ r }) => !r.done).slice()
    .sort((a, b) => knownCost(a.r.meso) - knownCost(b.r.meso))
    .map(({ s, r }) => ({ id: `sym-${s.symbol_name}`,
      label: `${s.symbol_name} Lv.${Math.min(Number(target), r.maxLevel ?? Number(target))} 달성`,
      detail: r.meso == null ? "강화 비용 미확인" : `강화 메소 ${fmtNum(r.meso)}`, auto: false }));
}

export function hexaSteps(rows, target) {
  return rows.filter((r) => r.from < Number(target)).slice()
    .sort((a, b) => knownCost(a.cost?.fragment) - knownCost(b.cost?.fragment))
    .map((r) => ({ id: `hexa-${r.name}`, label: `${r.name} Lv.${target} 달성`,
      detail: r.cost?.fragment == null ? "필요 조각 미확인" : `솔 에르다 조각 ${fmtInt(r.cost.fragment)}개`, auto: false }));
}

export function setupSteps(plan) {
  return (plan.nextSteps || []).map((s) => ({ id: `setup-${s.slot}`, label: s.slot, detail: s.text, auto: false }));
}

export function equipmentSteps(type, slot, label, done = false, auto = false) {
  return done ? [] : [{ id: `${type}-${slot}`, label, auto }];
}

/** 반환 steps에는 checked를 추가하고, checked/total에는 현재 단계만 집계합니다. */
export function mergeChecks(steps = [], done = []) {
  const ids = new Set(Array.isArray(done) ? done : []);
  const merged = steps.map((step) => ({ ...step, checked: step.auto === true || ids.has(step.id) }));
  return { steps: merged, checked: merged.filter((step) => step.checked).length, total: merged.length };
}
