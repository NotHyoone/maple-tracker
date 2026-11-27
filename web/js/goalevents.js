// 목표와 진행 중인 이벤트의 카테고리 매칭.
export const GOAL_CATEGORIES = {
  level: ["exp", "burning"], hexa: ["hexa"], symbol: ["symbol"],
  starforce: ["enhance"], potential: ["enhance"], setup: ["enhance"],
};

export function relatedEvents(goal, res, events, now = Date.now(), limit = 3) {
  const stamp = new Date(now).getTime();
  if (!Array.isArray(events) || !Number.isFinite(stamp) || !Number.isFinite(limit) || limit <= 0) return [];
  const categories = new Set([...(GOAL_CATEGORIES[goal?.type] || []), ...(res?.hasMeso ? ["meso"] : [])]);
  return events.filter((ev) => ev && Date.parse(ev.date_event_start) <= stamp && stamp < Date.parse(ev.date_event_end) &&
    Array.isArray(ev.categories) && ev.categories.some((category) => categories.has(category)))
    .slice().sort((a, b) => Date.parse(a.date_event_end) - Date.parse(b.date_event_end)).slice(0, Math.floor(limit));
}
