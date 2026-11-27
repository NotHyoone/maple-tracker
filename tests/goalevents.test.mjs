import { test } from "node:test";
import assert from "node:assert/strict";
import { GOAL_CATEGORIES, relatedEvents } from "../web/js/goalevents.js";

const now = Date.parse("2026-11-27T12:00:00+09:00");
const event = (id, categories, end = "2026-11-30T12:00:00+09:00", start = "2026-11-20T12:00:00+09:00") =>
  ({ notice_id: id, categories, date_event_start: start, date_event_end: end });

test("각 목표 카테고리와 매칭, 알 수 없는 목표", () => {
  const categories = ["exp", "burning", "hexa", "symbol", "enhance", "meso"];
  const events = categories.map((c) => event(c, [c]));
  for (const [type, expected] of Object.entries(GOAL_CATEGORIES)) {
    assert.deepEqual(relatedEvents({ type }, {}, events, now).map((e) => e.notice_id), expected);
  }
  assert.deepEqual(relatedEvents({ type: "unknown" }, {}, events, now), []);
});

test("시작 포함·종료 제외, 시작 전·날짜 누락·잘못된 날짜 제외", () => {
  const events = [event(1, ["exp"], "2026-11-27T12:00:00+09:00"),
    event(2, ["exp"], undefined, "2026-11-28T12:00:00+09:00"),
    event(3, ["exp"], undefined, "2026-11-27T12:00:00+09:00"),
    event(4, ["exp"], "bad"), { categories: ["exp"] }, event(5, null)];
  assert.deepEqual(relatedEvents({ type: "level" }, {}, events, now).map((e) => e.notice_id), [3]);
});

test("종료 임박 순 정렬, 기본 3개·limit·원본 보존", () => {
  const events = [30, 29, 28, 27].map((d) => event(d, ["exp"], `2026-11-${d}T23:59:00+09:00`));
  const select = (limit) => relatedEvents({ type: "level" }, {}, events, now, limit).map((e) => e.notice_id);
  assert.deepEqual(select(undefined), [27, 28, 29]);
  assert.deepEqual(select(1), [27]);
  assert.deepEqual(select(0), []);
  assert.deepEqual(select(-1), []);
  assert.deepEqual(events.map((e) => e.notice_id), [30, 29, 28, 27]);
  assert.deepEqual(relatedEvents({ type: "level" }, {}, null, now), []);
});

test("hasMeso일 때 meso 포함, 중복 카테고리 이벤트는 한 번만", () => {
  const events = [event(1, ["meso"]), event(2, ["enhance", "meso"]), event(3, ["hexa"])];
  assert.deepEqual(relatedEvents({ type: "setup" }, { hasMeso: true }, events, now).map((e) => e.notice_id), [1, 2]);
  assert.deepEqual(relatedEvents({ type: "setup" }, { hasMeso: false }, events, now).map((e) => e.notice_id), [2]);
});
