import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { odds, baseCost, attemptCost, expected, simulate, rng32, maxStar, trace } from "../web/js/calc/starforce.js";

const R = JSON.parse(readFileSync(new URL("../web/rules/starforce.json", import.meta.url)));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("공식 확률표 재현 (스타캐치 없음)", () => {
  const o = odds(R, 20); close(o.success, 0.3); close(o.keep, 0.595); close(o.destroy, 0.105);
  const o29 = odds(R, 29); close(o29.success, 0.01); close(o29.destroy, 0.198);
  const o10 = odds(R, 10); close(o10.destroy, 0); close(o10.keep, 0.5);
});

test("스타캐치: 넥슨 공지의 15성 예시 31.5% / 66.45% / 2.06%", () => {
  const o = odds(R, 15, { starcatch: true });
  close(o.success, 0.315); close(o.keep, 0.66445, 1e-6); close(o.destroy, 0.020550, 1e-6);
});

test("22→23 파괴 없이 성공할 확률 ≈ 48.31% (스타캐치, 커뮤니티 계산과 일치)", () => {
  const r = expected(R, { level: 200, from: 22, to: 23, starcatch: true });
  close(r.noBoomRate, 0.4831, 5e-5);
});

test("파괴 방지·이벤트 적용", () => {
  close(odds(R, 16, { safeguard: [16] }).destroy, 0);
  close(odds(R, 18, { safeguard: [18] }).destroy, 0.068); // 18성은 파괴 방지 불가
  close(odds(R, 21, { events: ["destroy30"] }).destroy, 0.1275 * 0.7);
  close(odds(R, 22, { events: ["destroy30"] }).destroy, 0.17);  // 22성은 적용 안 됨
  assert.deepEqual(odds(R, 15, { events: ["fiveTenFifteen"] }), { success: 1, keep: 0, destroy: 0 });
});

test("비용 공식", () => {
  assert.equal(baseCost(R, 200, 0), 321000);                 // 100*round(10 + 200^3/2500)
  const b17 = baseCost(R, 200, 17);
  assert.equal(b17, 100 * Math.round(10 + 8e6 * 18 ** 2.7 / 15000));
  assert.equal(attemptCost(R, 200, 17, { safeguard: [17] }), b17 * 3);           // 기본 + 200%
  assert.equal(attemptCost(R, 200, 17, { safeguard: [17], events: ["cost30"] }), 100 * Math.round((b17 * 0.7 + 2 * b17) / 100));
  assert.equal(attemptCost(R, 200, 16, { mvp: 0.1, pcroom: true }), 100 * Math.round(baseCost(R, 200, 16) * 0.9 * 0.95 / 100));
  assert.equal(attemptCost(R, 200, 17, { mvp: 0.1 }), b17);  // 17성부터 MVP 할인 없음
});

test("최대 성급과 흔적", () => {
  assert.equal(maxStar(R, 200), 30); assert.equal(maxStar(R, 130), 20); assert.equal(maxStar(R, 100), 8);
  assert.deepEqual(trace(R, 12), { star: 12, items: 0 });
  assert.deepEqual(trace(R, 17), { star: 17, items: 1 });
  assert.deepEqual(trace(R, 25), { star: 22, items: 4 });
});

test("파괴 없는 구간: 시도 횟수 = Σ 1/성공확률", () => {
  const r = expected(R, { level: 150, from: 0, to: 10 });
  const sum = R.probs.slice(0, 10).reduce((a, p) => a + 1 / p.success, 0);
  close(r.attempts, sum, 1e-9); close(r.booms, 0);
});

test("모의 시행 평균이 정확한 기댓값에 수렴", () => {
  const p = { level: 200, from: 12, to: 22, starcatch: true, replacementPrice: 1e9 };
  const e = expected(R, p);
  const s = simulate(R, p, { runs: 20000, random: rng32(42) });
  assert.ok(Math.abs(s.total.mean - e.total) / e.total < 0.03, `${s.total.mean} vs ${e.total}`);
  assert.ok(Math.abs(s.booms.mean - e.booms) < 0.05 * Math.max(1, e.booms));
  assert.ok(s.total.p10 <= s.total.p50 && s.total.p50 <= s.total.p90);
});

test("22성 넘는 파괴는 22성으로 돌아감", () => {
  const p = { level: 250, from: 23, to: 24, starcatch: true };
  const e = expected(R, p);
  assert.ok(e.booms > 0 && e.attempts > 1 / odds(R, 23, p).success);
  const s = simulate(R, p, { runs: 20000, random: rng32(7) });
  assert.ok(Math.abs(s.total.mean - e.total) / e.total < 0.03);
});

test("목표가 최대 성급을 넘으면 최대까지만", () => {
  assert.equal(expected(R, { level: 130, from: 15, to: 25 }).to, 20);
  assert.equal(expected(R, { level: 200, from: 20, to: 20 }).meso, 0);
});

import { detectStarforceEvents, starforceItems } from "../web/js/sfgoal.js";

test("진행 중 스타포스 이벤트 감지", () => {
  const now = Date.parse("2026-07-05T12:00+09:00");
  const ev = (title, text, s = "2026-07-05T00:00+09:00", e = "2026-07-05T23:59+09:00") => ({ title, text, date_event_start: s, date_event_end: e });
  assert.deepEqual(detectStarforceEvents([ev("썬데이 메이플", "샤이닝 스타포스 타임\n강화 비용 30% 할인")], now).events.sort(), ["cost30", "destroy30"]);
  assert.deepEqual(detectStarforceEvents([ev("썬데이", "스타포스 강화 시 5, 10, 15성에서 강화 성공 확률 100%")], now).events, ["fiveTenFifteen"]);
  assert.deepEqual(detectStarforceEvents([ev("썬데이", "10성 이하 스타포스 1+1")], now).events, ["onePlusOne"]);
  // 끝난 이벤트, 스타포스와 무관한 할인은 무시
  assert.deepEqual(detectStarforceEvents([ev("썬데이", "샤이닝 스타포스", "2026-06-01T00:00+09:00", "2026-06-02T00:00+09:00")], now).events, []);
  assert.deepEqual(detectStarforceEvents([ev("캐시샵", "30% 할인")], now).events, []);
});

test("강화 가능한 장비만 고름", () => {
  const c = { item: [
    { item_equipment_slot: "무기", item_level: 200, starforce: "17", starforce_scroll_flag: "미사용" },
    { item_equipment_slot: "엠블렘", item_level: 100, starforce: "0", starforce_scroll_flag: "미사용" },
    { item_equipment_slot: "펜던트", item_level: 0, starforce: "0", starforce_scroll_flag: "미사용" },
    { item_equipment_slot: "모자", item_level: 200, starforce: "30", starforce_scroll_flag: "미사용" },
    { item_equipment_slot: "벨트", item_level: 140, starforce: "10", starforce_scroll_flag: "사용" },
  ] };
  assert.deepEqual(starforceItems(c, R).map((x) => x.item_equipment_slot), ["무기"]);
});
