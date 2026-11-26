import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePrices, priceFromInput, ageDays, isStale, fragmentsToMeso, mesoToWon, sumMeso,
} from "../web/js/calc/prices.js";

const NOW = Date.parse("2026-11-27T12:00:00Z");

test("입력값 → 저장값: 조각 가격은 만 메소 단위", () => {
  assert.deepEqual(priceFromInput("fragment", "1,050", new Date(NOW)), { value: 10_500_000, updated: "2026-11-27" });
  assert.deepEqual(priceFromInput("mpPer100m", "2500", new Date(NOW)), { value: 2500, updated: "2026-11-27" });
  assert.equal(priceFromInput("fragment", "", new Date(NOW)), null);
  assert.equal(priceFromInput("fragment", "-3", new Date(NOW)), null);
  assert.equal(priceFromInput("fragment", "abc", new Date(NOW)), null);
});

test("normalizePrices는 잘못된 값과 모르는 항목을 버림", () => {
  assert.deepEqual(normalizePrices({ fragment: { value: 100, updated: "2026-11-01" }, mpPer100m: { value: "x" }, junk: { value: 1 } }),
    { fragment: { value: 100, updated: "2026-11-01" } });
  assert.deepEqual(normalizePrices(null), {});
});

test("오래된 시세 판정", () => {
  assert.equal(ageDays("2026-11-20", NOW), 7);
  assert.equal(isStale("2026-11-20", NOW), false);
  assert.equal(isStale("2026-11-01", NOW), true);
  assert.equal(ageDays(null, NOW), null);
});

test("조각→메소, 메소→원", () => {
  const p = normalizePrices({ fragment: { value: 10_000_000 }, mpPer100m: { value: 2500 } });
  assert.equal(fragmentsToMeso(2709, p), 27_090_000_000);
  assert.equal(mesoToWon(27_090_000_000, p), 677_250);
  assert.equal(fragmentsToMeso(10, {}), null);
  assert.equal(mesoToWon(1e8, {}), null);
});

test("sumMeso: 빠진 값/부분 값 표시", () => {
  assert.deepEqual(sumMeso([{ meso: 10 }, { meso: 5 }]), { total: 15, incomplete: false });
  assert.deepEqual(sumMeso([{ meso: 10 }, { meso: null }]), { total: 10, incomplete: true });
  assert.deepEqual(sumMeso([{ meso: 10, partial: true }]), { total: 10, incomplete: true });
  assert.deepEqual(sumMeso([{ meso: null }]), { total: null, incomplete: true });
  assert.deepEqual(sumMeso([]), { total: null, incomplete: false });
});
