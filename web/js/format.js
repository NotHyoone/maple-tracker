// 표시용 포맷/시간 계산 — DOM에 의존하지 않는 순수 함수 (node:test로 테스트)

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function fmtNum(v) {
  const n = Math.trunc(Number(String(v ?? "").replace(/,/g, "")));
  if (v == null || v === "" || !Number.isFinite(n)) return "-";
  const k = (x) => x.toLocaleString("ko-KR");
  if (n >= 1e12) {
    const eok = Math.floor((n % 1e12) / 1e8);
    return `${k(Math.floor(n / 1e12))}조${eok ? ` ${k(eok)}억` : ""}`;
  }
  if (n >= 1e8) {
    const man = Math.floor((n % 1e8) / 1e4);
    return `${k(Math.floor(n / 1e8))}억${man ? ` ${k(man)}만` : ""}`;
  }
  if (n >= 1e4) return `${k(Math.floor(n / 1e4))}만`;
  return k(n);
}

/** 개수처럼 정확히 보여야 하는 정수: 10573 → "10,573" */
export function fmtInt(v) {
  const n = Math.round(Number(v));
  return v == null || !Number.isFinite(n) ? "-" : n.toLocaleString("ko-KR");
}

// 넥슨 API 시각은 이미 KST("2026-11-26T10:00+09:00")이므로 문자열에서 바로 꺼냄
// → 기기 시간대와 무관하게 한국시간으로 표시
export function fmtDate(s) {
  if (typeof s !== "string" || s.length < 16) return "-";
  return `${s.slice(5, 7)}.${s.slice(8, 10)} ${s.slice(11, 16)}`;
}

const DAY = 864e5;

export function daysLeft(end, now = Date.now()) {
  const t = Date.parse(end ?? "");
  return Number.isNaN(t) ? null : (t - now) / DAY;
}

export function isUpcoming(start, now = Date.now()) {
  const t = Date.parse(start ?? "");
  return !Number.isNaN(t) && t > now;
}

/** 이벤트 남은 기간 배지 정보: {text, kind: 'new'|'hot'|''} 또는 null */
export function leftBadge(ev, now = Date.now()) {
  if (isUpcoming(ev.date_event_start, now)) return { text: `${fmtDate(ev.date_event_start)} 시작`, kind: "new" };
  const dl = daysLeft(ev.date_event_end, now);
  if (dl == null) return null;
  if (dl < 1) return { text: "오늘 종료", kind: "hot" };
  return { text: `D-${Math.floor(dl)}`, kind: dl <= 3 ? "hot" : "" };
}

export function isEndingSoon(ev, now = Date.now()) {
  const dl = daysLeft(ev.date_event_end, now);
  return dl != null && dl >= 0 && dl <= 3 && !isUpcoming(ev.date_event_start, now);
}

/** 스파크라인 좌표. 값이 2개 미만이면 null */
export function sparkPoints(values, w = 300, h = 60, pad = 6) {
  const vals = values.filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  return vals.map((v, i) => [
    pad + (i * (w - 2 * pad)) / (vals.length - 1),
    h - pad - ((v - lo) / span) * (h - 2 * pad),
  ]);
}
