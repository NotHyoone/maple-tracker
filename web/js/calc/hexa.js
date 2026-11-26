// HEXA 코어 목표 계산. rules = web/rules/hexa.json
// 표는 코어 이름별(cores_by_name)을 먼저 찾고, 없으면 코어 종류별(cores)을 씁니다.

/** 코어의 재료표 {table, source} 또는 null */
export function tableFor(rules, { name, type }) {
  const max = rules?.max_level ?? 30;
  const byName = rules?.cores_by_name?.[name];
  if (Array.isArray(byName?.table) && byName.table.length >= max) return { table: byName.table, source: byName.source };
  const byType = rules?.cores?.[type];
  if (Array.isArray(byType) && byType.length >= max) return { table: byType, source: rules.source ?? null };
  return null;
}

/** from → to 레벨까지 필요한 {sol_erda, fragment, source}. 표가 없으면 null */
export function hexaCost(rules, core, from, to) {
  const t = tableFor(rules, core);
  if (!t) return null;
  const max = rules.max_level ?? 30;
  from = Math.max(0, Number(from)); to = Math.min(max, Number(to));
  let sol_erda = 0, fragment = 0;
  for (let i = from; i < to; i++) {
    sol_erda += Number(t.table[i].sol_erda || 0);
    fragment += Number(t.table[i].fragment || 0);
  }
  return { sol_erda, fragment, source: t.source };
}

/** 여러 코어를 목표 레벨로: cores=[{hexa_core_type, hexa_core_level, hexa_core_name}] */
export function hexaGoal(rules, cores, target) {
  const rows = cores.map((c) => ({
    name: c.hexa_core_name, type: c.hexa_core_type, from: Number(c.hexa_core_level),
    cost: hexaCost(rules, { name: c.hexa_core_name, type: c.hexa_core_type }, c.hexa_core_level, target),
  })).filter((r) => r.from < Number(target));
  const known = rows.filter((r) => r.cost);
  const unknown = rows.filter((r) => !r.cost);
  const partial = known.reduce((s, r) => ({ sol_erda: s.sol_erda + r.cost.sol_erda, fragment: s.fragment + r.cost.fragment }),
    { sol_erda: 0, fragment: 0 });
  return {
    rows,
    total: unknown.length ? null : partial,  // 모든 코어의 표가 있을 때만
    partial: known.length ? partial : null,   // 표가 있는 코어만 합친 값
    unknownTypes: [...new Set(unknown.map((r) => r.type))],
    sources: [...new Set(known.map((r) => r.cost.source).filter(Boolean))],
  };
}
