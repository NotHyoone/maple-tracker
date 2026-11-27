// 목표 진행률과 페이스. DOM·저장소에 의존하지 않습니다.
import { remainingExp } from "./calc/level.js";

const DAY = 864e5;
const validState = (s) => s != null && s.level != null && s.exp != null &&
  Number.isInteger(Number(s.level)) && Number(s.level) >= 1 && Number(s.level) <= 300 &&
  Number.isFinite(Number(s.exp)) && Number(s.exp) >= 0;
const time = (value) => value == null || value === "" ? NaN : new Date(value).getTime();

export function createdFromId(id) {
  if (typeof id !== "string" || !/^[0-9a-z]{5,}$/i.test(id)) return null;
  const stamp = Number.parseInt(id.slice(0, -4), 36);
  return Number.isSafeInteger(stamp) && stamp > 0 && Number.isFinite(time(stamp)) ? new Date(stamp) : null;
}

export function goalStart(goal, c) {
  if (goal.start != null) return goal.start;
  if (goal.type !== "level") return null;
  const created = goal.created ?? createdFromId(goal.id);
  const stamp = time(created);
  if (!Number.isFinite(stamp)) return null;
  // 일별 기록은 한국 날짜 기준이므로 생성 시각도 같은 날짜로 맞춥니다.
  const day = typeof created === "string" && /^\d{4}-\d{2}-\d{2}$/.test(created)
    ? created : new Date(stamp + 9 * 36e5).toISOString().slice(0, 10);
  const history = (c?.history || []).filter((h) => validState(h) &&
    typeof h.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && Number.isFinite(time(h.date)))
    .slice().sort((a, b) => a.date.localeCompare(b.date));
  const record = history.find((h) => h.date >= day) || history.at(-1);
  return record ? { level: record.level, exp: record.exp } : null;
}

export function levelProgress(start, current, target, table) {
  if (!validState(start) || !validState(current) || !Number.isInteger(Number(target)) ||
    Number(target) < 1 || Number(target) > 300 || !(table instanceof Map)) return null;
  const total = remainingExp(start, target, table).remaining;
  const left = remainingExp(current, target, table).remaining;
  if (total == null || left == null || !Number.isFinite(total) || !Number.isFinite(left)) return null;
  if (total <= 0) return Number(current.level) >= Number(target) ? 1 : null;
  return Math.max(0, Math.min(1, (total - left) / total));
}

export function pace({ remaining, perDay, deadline, now = Date.now() }) {
  const stamp = time(now);
  // 날짜 입력은 해당 한국 날짜의 끝까지 유효합니다.
  const end = time(typeof deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(deadline)
    ? `${deadline}T23:59:59.999+09:00` : deadline);
  const known = remaining != null && Number.isFinite(remaining) && remaining >= 0;
  const overdue = Number.isFinite(end) && Number.isFinite(stamp) && end < stamp;
  const days = (end - stamp) / DAY;
  const needPerDay = known && days > 0 ? remaining / days : null;
  const eta = known && Number.isFinite(perDay) && perDay > 0 && Number.isFinite(stamp)
    ? time(stamp + remaining / perDay * DAY) : NaN;
  const etaDate = Number.isFinite(eta) ? new Date(eta) : null;
  const onTrack = !Number.isFinite(end) || !known ? null
    : overdue ? remaining === 0 : remaining === 0 ? true : etaDate ? eta <= end : null;
  return { needPerDay, etaDate, onTrack, overdue };
}
