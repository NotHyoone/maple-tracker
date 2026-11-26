import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, fmtNum, fmtInt, fmtDate, daysLeft, leftBadge, isEndingSoon, sparkPoints } from "../web/js/format.js";

const NOW = Date.parse("2026-11-27T12:00+09:00");

test("esc는 HTML 특수문자를 이스케이프", () => {
  assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  assert.equal(esc(null), "");
});

test("fmtNum 억/만 단위", () => {
  assert.equal(fmtNum("2436000000"), "24억 3,600만");
  assert.equal(fmtNum(123456), "12만");
  assert.equal(fmtNum(999), "999");
  assert.equal(fmtNum(109463084746746), "109조 4,630억");
  assert.equal(fmtNum(2e12), "2조");
  assert.equal(fmtNum(1e9), "10억");
  assert.equal(fmtNum(undefined), "-");
  assert.equal(fmtNum("abc"), "-");
});

test("fmtInt는 반올림 없이 정확한 개수", () => {
  assert.equal(fmtInt(10573), "10,573");
  assert.equal(fmtInt(null), "-");
});

test("fmtDate는 기기 시간대와 무관하게 KST 문자열 그대로", () => {
  assert.equal(fmtDate("2026-11-26T10:00+09:00"), "11.26 10:00");
  assert.equal(fmtDate(null), "-");
});

test("daysLeft / leftBadge", () => {
  assert.equal(daysLeft("2026-11-30T12:00+09:00", NOW), 3);
  assert.equal(daysLeft(null, NOW), null);
  assert.deepEqual(leftBadge({ date_event_end: "2026-12-16T23:59+09:00" }, NOW), { text: "D-19", kind: "" });
  assert.deepEqual(leftBadge({ date_event_end: "2026-11-29T23:59+09:00" }, NOW), { text: "D-2", kind: "hot" });
  assert.deepEqual(leftBadge({ date_event_end: "2026-11-27T23:59+09:00" }, NOW), { text: "오늘 종료", kind: "hot" });
  assert.deepEqual(leftBadge({ date_event_start: "2026-12-01T10:00+09:00", date_event_end: "2026-12-30T23:59+09:00" }, NOW),
    { text: "12.01 10:00 시작", kind: "new" });
});

test("isEndingSoon은 이미 끝났거나 예정인 이벤트를 제외", () => {
  assert.equal(isEndingSoon({ date_event_end: "2026-11-29T23:59+09:00" }, NOW), true);
  assert.equal(isEndingSoon({ date_event_end: "2026-11-26T23:59+09:00" }, NOW), false);
  assert.equal(isEndingSoon({ date_event_start: "2026-11-28T10:00+09:00", date_event_end: "2026-11-29T23:59+09:00" }, NOW), false);
});

test("sparkPoints", () => {
  assert.equal(sparkPoints([5]), null);
  assert.equal(sparkPoints([null, 3]), null);
  const p = sparkPoints([1, 2, 3]);
  assert.equal(p.length, 3);
  assert.deepEqual(p[0], [6, 54]);
  assert.deepEqual(p[2], [294, 6]);
  assert.equal(sparkPoints([7, 7]).length, 2); // 값이 같아도 0으로 나누지 않음
});
