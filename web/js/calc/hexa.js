// HEXA 코어 목표 계산. rules = web/rules/hexa.json

/** 코어 종류의 재료표가 확인되어 있는지 */
export function hasTable(rules, type) {
  return Array.isArray(rules?.cores?.[type]) && rules.cores[type].length >= (rules.max_level ?? 30);
}

/** from → to 레벨까지 필요한 {sol_erda, fragment}. 표가 없으면 null */
export function hexaCost(rules, type, from, to) {
  if (!hasTable(rules, type)) return null;
  const max = rules.max_level ?? 30;
  from = Math.max(0, Number(from)); to = Math.min(max, Number(to));
  let sol_erda = 0, fragment = 0;
  for (let i = from; i < to; i++) {
    sol_erda += Number(rules.cores[type][i].sol_erda || 0);
    fragment += Number(rules.cores[type][i].fragment || 0);
  }
  return { sol_erda, fragment };
}

/** 여러 코어를 목표 레벨로: cores=[{hexa_core_type, hexa_core_level, hexa_core_name}] */
export function hexaGoal(rules, cores, target) {
  const rows = cores.map((c) => ({
    name: c.hexa_core_name, type: c.hexa_core_type, from: Number(c.hexa_core_level),
    cost: hexaCost(rules, c.hexa_core_type, c.hexa_core_level, target),
  })).filter((r) => r.from < Number(target));
  const unknownTypes = [...new Set(rows.filter((r) => !r.cost).map((r) => r.type))];
  const total = unknownTypes.length ? null : rows.reduce((s, r) => ({
    sol_erda: s.sol_erda + r.cost.sol_erda, fragment: s.fragment + r.cost.fragment,
  }), { sol_erda: 0, fragment: 0 });
  return { rows, total, unknownTypes };
}
