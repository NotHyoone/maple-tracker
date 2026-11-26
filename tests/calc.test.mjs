import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildExpTable, remainingExp, dailyExpGain } from "../web/js/calc/level.js";
import { growthReq, symbolGoal, daysFor, parseSymbolName } from "../web/js/calc/symbol.js";
import { hexaCost, hexaGoal } from "../web/js/calc/hexa.js";

const symbolRules = JSON.parse(readFileSync(new URL("../web/rules/symbol.json", import.meta.url)));
const hexaRules = JSON.parse(readFileSync(new URL("../web/rules/hexa.json", import.meta.url)));

test("심볼 성장치 공식이 넥슨 API 실측값과 일치", () => {
  // symbol_require_growth_count 실측 (2026-11-27)
  const measured = [["아케인심볼", 3, 20], ["아케인심볼", 19, 372], ["아케인심볼", 20, 411],
    ["어센틱심볼", 5, 325], ["어센틱심볼", 6, 444], ["어센틱심볼", 8, 736]];
  for (const [kind, lv, req] of measured) assert.equal(growthReq(symbolRules, kind, lv), req, `${kind} Lv.${lv}`);
  assert.equal(growthReq(symbolRules, "그랜드 어센틱심볼", 1), null); // 미확인
});

test("symbolGoal: 모아둔 성장치 차감, 최대 레벨 제한, 메소 미확인은 null", () => {
  assert.deepEqual(parseSymbolName("어센틱심볼 : 세르니움"), { kind: "어센틱심볼", region: "세르니움" });
  const r = symbolGoal(symbolRules, { symbol_name: "어센틱심볼 : 세르니움", symbol_level: 8, symbol_growth_count: 1710 }, 11);
  // 8→9: 736, 9→10: 909, 10→11: 1100 → 2745 - 1710
  assert.equal(r.growth, 2745 - 1710);
  const c = symbolRules.kinds["어센틱심볼"].cost_meso["세르니움"];
  assert.equal(r.meso, c[7] + c[8] + c[9]); // Lv.8→9, 9→10, 10→11
  // 그랜드 어센틱: 메소는 있지만 성장치 공식은 미확인
  const g = symbolGoal(symbolRules, { symbol_name: "그랜드 어센틱심볼 : 탈라하트", symbol_level: 1, symbol_growth_count: 0 }, 3);
  assert.equal(g.growth, null);
  assert.equal(g.meso, 113600000 + 293300000);
  const capped = symbolGoal(symbolRules, { symbol_name: "아케인심볼 : 레헬른", symbol_level: 19, symbol_growth_count: 0 }, 25);
  assert.equal(capped.growth, 372); // 20에서 멈춤
  assert.equal(symbolGoal(symbolRules, { symbol_name: "아케인심볼 : 레헬른", symbol_level: 20 }, 20).done, true);
  // 이미 충분히 모았으면 0
  assert.equal(symbolGoal(symbolRules, { symbol_name: "어센틱심볼 : 세르니움", symbol_level: 8, symbol_growth_count: 5000 }, 9).growth, 0);
  assert.equal(daysFor(1035, 20), 52);
  assert.equal(daysFor(1035, 0), null);
});

test("레벨: 남은 경험치, 빠진 레벨 표시, 근사 여부", () => {
  const table = buildExpTable({ exp: { 251: 1000 } }, { 250: { required: 500 }, 252: 2000 });
  assert.deepEqual(remainingExp({ level: 250, exp: 100 }, 253, table), { remaining: 400 + 1000 + 2000, missing: [], approx: true });
  assert.deepEqual(remainingExp({ level: 250, exp: 100 }, 255, table).missing, [253, 254]);
  assert.equal(remainingExp({ level: 250, exp: 100 }, 255, table).remaining, null);
  assert.equal(remainingExp({ level: 251, exp: 0 }, 252, table).approx, false);
  assert.equal(remainingExp({ level: 260, exp: 0 }, 250, table).remaining, 0);
});

test("dailyExpGain: 레벨업 포함 기록", () => {
  const table = buildExpTable({ exp: { 250: 1000, 251: 2000 } });
  const h = [{ date: "2026-11-01", level: 250, exp: 200 }, { date: "2026-11-02", level: 250, exp: 700 },
    { date: "2026-11-04", level: 251, exp: 500 }];
  // 500 + (300 + 500) = 1300 / 3일
  assert.equal(dailyExpGain(h, table), 1300 / 3);
  assert.equal(dailyExpGain(h.slice(0, 1), table), null);
  assert.equal(dailyExpGain([{ date: "2026-11-01", level: 249, exp: 1 }, { date: "2026-11-02", level: 250, exp: 1 }], table), null);
});

test("HEXA: 이름별 표 우선, 없으면 종류별, 둘 다 없으면 null", () => {
  const fake = { max_level: 3,
    cores: { A: [{ sol_erda: 5, fragment: 100 }, { sol_erda: 1, fragment: 30 }, { sol_erda: 2, fragment: 40 }], B: null },
    cores_by_name: { special: { table: [{ sol_erda: 9, fragment: 9 }, { sol_erda: 9, fragment: 9 }, { sol_erda: 9, fragment: 9 }], source: "s" } } };
  assert.deepEqual(hexaCost(fake, { name: "x", type: "A" }, 1, 3), { sol_erda: 3, fragment: 70, source: null });
  assert.equal(hexaCost(fake, { name: "special", type: "B" }, 0, 1).sol_erda, 9);
  assert.equal(hexaCost(fake, { name: "y", type: "B" }, 0, 1), null);
  const g = hexaGoal(fake, [{ hexa_core_type: "A", hexa_core_level: 1, hexa_core_name: "x" },
    { hexa_core_type: "A", hexa_core_level: 3, hexa_core_name: "done" },
    { hexa_core_type: "B", hexa_core_level: 0, hexa_core_name: "y" }], 3);
  assert.equal(g.rows.length, 2);
  assert.equal(g.total, null);
  assert.deepEqual(g.partial, { sol_erda: 3, fragment: 70 });
  assert.deepEqual(g.unknownTypes, ["B"]);
});

test("HEXA 실제 표: 솔 야누스 누적값이 출처 페이지와 일치", () => {
  assert.deepEqual(hexaCost(hexaRules, { name: "솔 야누스", type: "공용 코어" }, 0, 30).sol_erda, 208);
  assert.deepEqual(hexaCost(hexaRules, { name: "솔 야누스", type: "공용 코어" }, 0, 20).fragment, 2916);
  assert.equal(hasRealTable("스킬 코어"), false);
});

function hasRealTable(type) { return hexaCost(hexaRules, { name: "?", type }, 0, 1) != null; }
