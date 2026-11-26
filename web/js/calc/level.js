// 레벨 목표 계산. table: Map(level -> {exp, exact}) — 정확값(공식 표) 또는 근사값(실측)

/** rules/level.json(정확) + observed(실측 근사)를 합친 표. 정확값이 우선 */
export function buildExpTable(rules, observed) {
  const t = new Map();
  for (const [lv, v] of Object.entries(observed || {})) t.set(Number(lv), { exp: Number(v.required ?? v), exact: false });
  for (const [lv, v] of Object.entries(rules?.exp || {})) t.set(Number(lv), { exp: Number(v), exact: true });
  return t;
}

/**
 * 현재 상태에서 목표 레벨까지 남은 경험치.
 * 반환 {remaining, missing: [필요한데 표에 없는 레벨], approx: 근사값 사용 여부}
 * remaining은 missing이 있으면 null
 */
export function remainingExp({ level, exp }, target, table) {
  level = Number(level); target = Number(target);
  if (!(target > level)) return { remaining: 0, missing: [], approx: false };
  const missing = [];
  let total = 0, approx = false;
  for (let lv = level; lv < target; lv++) {
    const row = table.get(lv);
    if (!row) { missing.push(lv); continue; }
    if (!row.exact) approx = true;
    total += lv === level ? Math.max(0, row.exp - Number(exp || 0)) : row.exp;
  }
  return { remaining: missing.length ? null : total, missing, approx };
}

/**
 * 일별 기록(history: [{date, level, exp}])으로 하루 평균 획득 경험치(절대값).
 * 레벨업이 끼어 있으면 그 레벨들의 필요 경험치가 표에 있어야 계산됩니다. 계산 불가면 null.
 */
export function dailyExpGain(history, table, days = 7) {
  const recent = (history || []).filter((h) => h.exp != null && h.level != null).slice(-(days + 1));
  if (recent.length < 2) return null;
  let gained = 0;
  for (let i = 1; i < recent.length; i++) {
    const p = recent[i - 1], c = recent[i];
    if (c.level === p.level) { gained += Number(c.exp) - Number(p.exp); continue; }
    const r = remainingExp({ level: p.level, exp: p.exp }, c.level, table);
    if (r.remaining == null) return null;
    gained += r.remaining + Number(c.exp);
  }
  const span = (Date.parse(recent.at(-1).date) - Date.parse(recent[0].date)) / 864e5;
  return span > 0 ? gained / span : null;
}
