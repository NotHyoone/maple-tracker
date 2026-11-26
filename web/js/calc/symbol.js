// 심볼 목표 계산. rules = web/rules/symbol.json

/** "어센틱심볼 : 세르니움" → { kind: "어센틱심볼", region: "세르니움" } */
export function parseSymbolName(name) {
  const [kind, region = ""] = String(name).split(" : ").map((s) => s.trim());
  return { kind, region };
}

/** 레벨 n→n+1 필요 성장치. 공식이 없으면 null */
export function growthReq(rules, kind, n) {
  const f = rules?.kinds?.[kind]?.growth;
  return f ? f.a * n * n + f.b * n + f.c : null;
}

/** 레벨 n→n+1 강화 메소. 표가 없으면 null */
export function mesoCost(rules, kind, region, n) {
  const c = rules?.kinds?.[kind]?.cost_meso;
  const arr = c?.[region] ?? c?.["*"];
  const v = arr?.[n - 1];
  return v == null ? null : Number(v);
}

/**
 * 현재 레벨/성장치에서 목표 레벨까지.
 * 반환 {growth: 더 모아야 할 성장치(null=표 없음), meso: 필요 메소(null=표 없음), maxLevel}
 * 이미 모아둔 성장치(growth)는 차감합니다 (API의 symbol_growth_count).
 */
export function symbolGoal(rules, { symbol_name, symbol_level, symbol_growth_count }, target) {
  const { kind, region } = parseSymbolName(symbol_name);
  const maxLevel = rules?.kinds?.[kind]?.max_level ?? null;
  const from = Number(symbol_level);
  const to = Math.min(Number(target), maxLevel ?? Number(target));
  if (!(to > from)) return { kind, region, growth: 0, meso: 0, maxLevel, done: true };
  let growth = 0, meso = 0;
  for (let n = from; n < to; n++) {
    const g = growthReq(rules, kind, n);
    growth = g == null || growth == null ? null : growth + g;
    const m = mesoCost(rules, kind, region, n);
    meso = m == null || meso == null ? null : meso + m;
  }
  if (growth != null) growth = Math.max(0, growth - Number(symbol_growth_count || 0));
  return { kind, region, growth, meso, maxLevel, done: false };
}

/** 하루 획득량으로 걸리는 일수 (올림). 입력이 없으면 null */
export function daysFor(amount, perDay) {
  return amount == null || !(perDay > 0) ? null : Math.ceil(amount / perDay);
}
