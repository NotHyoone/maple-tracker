import { test } from "node:test";
import assert from "node:assert/strict";
import { levelSteps, symbolSteps, hexaSteps, setupSteps, equipmentSteps, mergeChecks } from "../web/js/roadmap.js";
import { renderGoalsTab } from "../web/js/goals.js";

test("레벨: 262 → 275 마일스톤과 구간 경험치 (현재 경험치는 첫 구간에서만 차감)", () => {
  const table = new Map(Array.from({ length: 13 }, (_, i) => [262 + i, { exp: 100, exact: true }]));
  const steps = levelSteps({ level: 262, exp: 25 }, 275, table);
  assert.deepEqual(steps.map((s) => s.id), ["lv-265", "lv-270", "lv-275"]);
  assert.deepEqual(steps.map((s) => s.auto), [false, false, false]);
  assert.match(steps[0].detail, /275$/);
  assert.match(steps[1].detail, /500$/);
  assert.match(steps[2].detail, /500$/);
  assert.deepEqual(levelSteps({ level: 265 }, 272).map((s) => s.id), ["lv-270", "lv-272"]);
});

test("레벨: 미확인 경험치는 생략하고 잘못된 레벨은 거부", () => {
  assert.equal(levelSteps({ level: 262 }, 265)[0].detail, undefined);
  for (const target of [NaN, Infinity, 301, 270.5]) assert.deepEqual(levelSteps({ level: 262 }, target), []);
});

test("심볼: 강화 비용순, 0은 알려진 비용, 미확인은 뒤로, 입력 순서 보존", () => {
  const rows = [
    { s: { symbol_name: "미확인" }, r: { meso: null } },
    { s: { symbol_name: "비쌈" }, r: { meso: 200 } },
    { s: { symbol_name: "완료" }, r: { meso: 0, done: true } },
    { s: { symbol_name: "무료" }, r: { meso: 0, maxLevel: 11 } },
    { s: { symbol_name: "저렴" }, r: { meso: 100 } },
  ];
  assert.deepEqual(symbolSteps(rows, 20).map((s) => s.id), ["sym-무료", "sym-저렴", "sym-비쌈", "sym-미확인"]);
  assert.match(symbolSteps(rows, 20)[0].label, /Lv.11/);
  assert.equal(rows[0].s.symbol_name, "미확인");
});

test("HEXA: 조각 수순, 미확인은 뒤로, 달성 코어 제외", () => {
  const rows = [
    { name: "미확인", from: 1, cost: null },
    { name: "비쌈", from: 1, cost: { fragment: 50 } },
    { name: "완료", from: 30, cost: { fragment: 0 } },
    { name: "저렴", from: 1, cost: { fragment: 10 } },
    { name: "누락", from: 1, cost: {} },
  ];
  assert.deepEqual(hexaSteps(rows, 30).map((s) => s.id), ["hexa-저렴", "hexa-비쌈", "hexa-미확인", "hexa-누락"]);
  assert.equal(rows[0].name, "미확인");
});

test("mergeChecks: 자동 달성·수동 체크 합집합, 중복·이전 단계는 집계 제외", () => {
  const steps = [{ id: "auto", auto: true }, { id: "manual", auto: false }, { id: "unknown", auto: null }];
  const result = mergeChecks(steps, ["auto", "manual", "manual", "old"]);
  assert.equal(result.checked, 2);
  assert.equal(result.total, 3);
  assert.deepEqual(result.steps.map((s) => s.checked), [true, true, false]);
  assert.equal(steps[0].checked, undefined);
  assert.equal(mergeChecks(steps).checked, 1);
  assert.equal(mergeChecks(steps, null).checked, 1);
  assert.equal(mergeChecks(steps, ["unknown"]).checked, 2);
});

test("달성 목표·빈 입력은 단계 없음", () => {
  assert.deepEqual(levelSteps({ level: 275 }, 275), []);
  assert.deepEqual(levelSteps({ level: 280 }, 275), []);
  assert.deepEqual(symbolSteps([{ s: {}, r: { done: true } }], 20), []);
  assert.deepEqual(hexaSteps([{ from: 30 }], 30), []);
  assert.deepEqual(equipmentSteps("sf", "무기", "22성", true), []);
  assert.deepEqual(equipmentSteps("pot", "무기", "레전드리", true), []);
  assert.deepEqual(setupSteps({ nextSteps: [] }), []);
  assert.deepEqual(mergeChecks(), { steps: [], checked: 0, total: 0 });
});

test("세팅: nextSteps 순서를 유지하고 슬롯 id와 설명으로 변환", () => {
  assert.deepEqual(setupSteps({ nextSteps: [{ slot: "반지2", text: "재설정" }, { slot: "반지1", text: "등급 상승" }] }), [
    { id: "setup-반지2", label: "반지2", detail: "재설정", auto: false },
    { id: "setup-반지1", label: "반지1", detail: "등급 상승", auto: false },
  ]);
  assert.equal(equipmentSteps("sf", "무기", "22성").length, 1);
  assert.equal(equipmentSteps("pot", "무기", "레전드리").length, 1);
});

// 렌더러에서 사용하는 DOM 경계만 대체하여 저장 성공/실패와 재렌더링 없는 카운트를 검증합니다.
test("카드 체크: 기존 done 없음, 저장·해제·실패 복구, 다른 필드 보존", () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let saved = [{ id: 'goal"<', char: "테스트", type: "level", target: 270, custom: "유지" }];
  let fail = false;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => key === "maple-tracker:goals" ? JSON.stringify(saved) : null,
    setItem: (key, value) => { if (fail) throw new Error("차단"); saved = JSON.parse(value); },
  } });
  try {
    const summary = { textContent: "로드맵 0/1" }, message = { textContent: "" };
    const box = { dataset: { goal: 'goal"<', step: "lv-270" }, checked: false,
      addEventListener: (_, fn) => { box.change = fn; }, closest: () => roadmap };
    const roadmap = { querySelector: (sel) => sel === "summary" ? summary : message, querySelectorAll: () => [box] };
    const root = { innerHTML: "", querySelector: () => ({ addEventListener() {} }),
      querySelectorAll: (sel) => sel === ".roadmap input[data-step]" ? [box] : [] };
    const ctx = { chars: [{ basic: { character_name: "테스트", character_level: 265 } }],
      rules: { level: {} }, setupTabs() {} };
    renderGoalsTab(root, ctx);
    const html = root.innerHTML;
    assert.match(html, /<details class="roadmap"><summary>로드맵 0\/1/);
    assert.match(html, /data-goal="goal&quot;&lt;"/);
    box.checked = true;
    box.change();
    assert.deepEqual(saved[0].done, ["lv-270"]);
    assert.equal(saved[0].custom, "유지");
    assert.equal(summary.textContent, "로드맵 1/1");
    assert.equal(root.innerHTML, html);
    fail = true;
    box.checked = false;
    box.change();
    assert.equal(box.checked, true);
    assert.equal(summary.textContent, "로드맵 1/1");
    assert.match(message.textContent, /저장하지 못했습니다/);
    fail = false;
    box.checked = false;
    box.change();
    assert.deepEqual(saved[0].done, []);
    assert.equal(summary.textContent, "로드맵 0/1");
    assert.equal(message.textContent, "");
    saved[0].target = 265;
    renderGoalsTab(root, ctx);
    assert.ok(!root.innerHTML.includes('<details class="roadmap">'));
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  }
});
