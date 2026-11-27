import { test } from "node:test";
import assert from "node:assert/strict";
import { createdFromId, goalStart, levelProgress, pace } from "../web/js/progress.js";
import { renderGoalsTab } from "../web/js/goals.js";

const now = Date.parse("2026-11-27T15:00:00+09:00");
const table = new Map([[250, { exp: 100, exact: true }], [251, { exp: 200, exact: true }]]);

test("createdFromId: 시간 왕복과 잘못된 ID", () => {
  assert.equal(createdFromId(now.toString(36) + "a1b2").getTime(), now);
  for (const id of [undefined, null, 123, "", "abcd", "bad!abcd", "0abcd", "z".repeat(40)]) {
    assert.equal(createdFromId(id), null);
  }
});

test("goalStart: 명시한 시작값 우선, 생성일 이후 첫 기록과 이전 최근 기록 추정", () => {
  const start = { level: 249, exp: 1 };
  const history = [{ date: "2026-11-29", level: 251, exp: 20 },
    { date: "2026-11-25", level: 250, exp: 10 }, { date: "2026-11-28", level: 250, exp: 50 }];
  const goal = { type: "level", created: "2026-11-27" };
  assert.equal(goalStart({ ...goal, start }, {}), start);
  assert.deepEqual(goalStart(goal, { history }), { level: 250, exp: 50 });
  assert.deepEqual(goalStart({ ...goal, created: "2026-11-30" }, { history }), { level: 251, exp: 20 });
  assert.deepEqual(goalStart({ type: "level", id: now.toString(36) + "abcd" }, { history }), { level: 250, exp: 50 });
  assert.deepEqual(history.map((h) => h.date), ["2026-11-29", "2026-11-25", "2026-11-28"]);
});

test("goalStart: 한국 날짜와 같은 날 기록, 누락·비레벨 목표·잘못된 기록", () => {
  const history = [{ date: "2026-11-27", level: 250, exp: 0 }];
  assert.deepEqual(goalStart({ type: "level", created: "2026-11-26T16:00:00Z" }, { history }), { level: 250, exp: 0 });
  assert.equal(goalStart({ type: "hexa", created: "2026-11-27" }, { history }), null);
  assert.equal(goalStart({ type: "level" }, { history }), null);
  assert.equal(goalStart({ type: "level", created: "bad" }, { history }), null);
  assert.equal(goalStart({ type: "level", created: "2026-11-27" }, {}), null);
  assert.equal(goalStart({ type: "level", created: "2026-11-27" }, { history: [{ date: "bad", level: 250, exp: 0 },
    { date: "2026-11-28", level: 250 }] }), null);
});

test("levelProgress: 경험치 비율, 동일 레벨 경험치, clamp와 계산 불가", () => {
  const start = { level: 250, exp: 0 };
  assert.equal(levelProgress(start, { level: 251, exp: 50 }, 252, table), 0.5);
  assert.equal(levelProgress(start, { level: 250, exp: 30 }, 251, table), 0.3);
  assert.equal(levelProgress({ level: 250, exp: 50 }, start, 251, table), 0);
  assert.equal(levelProgress(start, { level: 253, exp: 0 }, 252, table), 1);
  assert.equal(levelProgress(start, start, 250, table), 1);
  assert.equal(levelProgress(start, start, 253, table), null);
  for (const state of [null, {}, { level: 250, exp: NaN }, { level: 250, exp: null }]) {
    assert.equal(levelProgress(state, start, 252, table), null);
  }
});

test("pace: 마감 없음, 예상 완료일과 속도 없음", () => {
  const p = pace({ remaining: 100, perDay: 20, now });
  assert.equal(p.needPerDay, null);
  assert.equal(p.etaDate.getTime(), now + 5 * 864e5);
  assert.equal(p.onTrack, null);
  assert.equal(p.overdue, false);
  for (const perDay of [undefined, null, 0, -1, NaN]) {
    assert.equal(pace({ remaining: 100, perDay, now }).etaDate, null);
  }
});

test("pace: 마감까지 하루 필요량, 제때 가능 여부와 기록 부족", () => {
  const deadline = new Date(now + 5 * 864e5);
  const p = pace({ remaining: 100, perDay: 20, deadline, now });
  assert.equal(p.needPerDay, 20);
  assert.equal(p.onTrack, true);
  assert.equal(pace({ remaining: 100, perDay: 10, deadline, now }).onTrack, false);
  assert.equal(pace({ remaining: 100, deadline, now }).onTrack, null);
  assert.equal(pace({ remaining: null, perDay: 20, deadline, now }).needPerDay, null);
  assert.equal(pace({ remaining: null, perDay: 20, deadline, now }).etaDate, null);
  assert.equal(pace({ remaining: 0, deadline, now }).onTrack, true);
});

test("pace: 마감 지남과 날짜 입력의 한국시간 당일 끝", () => {
  const p = pace({ remaining: 100, perDay: 20, deadline: "2026-11-26", now });
  assert.equal(p.overdue, true);
  assert.equal(p.needPerDay, null);
  assert.equal(p.onTrack, false);
  const today = pace({ remaining: 100, deadline: "2026-11-27", now });
  assert.equal(today.overdue, false);
  assert.ok(today.needPerDay > 100);
  assert.equal(pace({ remaining: 100, deadline: "bad", now }).needPerDay, null);
});

test("목표 카드: 레벨 진행률·페이스, 이벤트 배지·보상 이스케이프, 기존 목표 호환", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const saved = [{ id: "level", char: "테스트", type: "level", target: 252,
    start: { level: 250, exp: 0 }, deadline: "2099-12-31" },
  { id: "old", char: "테스트", type: "level", target: 252 }];
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => key === "maple-tracker:goals" ? JSON.stringify(saved) : null,
  } });
  try {
    const root = { innerHTML: "", querySelector: () => ({ addEventListener() {} }), querySelectorAll: () => [] };
    const ctx = { chars: [{ basic: { character_name: "테스트", character_level: 251, character_exp: 50 },
      history: [{ date: "2026-11-25", level: 250, exp: 0 }, { date: "2026-11-26", level: 251, exp: 50 }] }],
    rules: { level: { exp: { 250: 100, 251: 200 } } }, setupTabs() {},
    events: [{ title: '<보상&이벤트>', categories: ["exp"], date_event_start: "2020-01-01", date_event_end: "2099-12-31",
      highlights: ['<쿠폰>', '조각&메소', '세 번째 보상'] }] };
    renderGoalsTab(root, ctx);
    assert.match(root.innerHTML, /<progress max="1" value="0.5"/);
    assert.match(root.innerHTML, /시작 Lv.250 → 현재 Lv.251 → 목표 Lv.252/);
    assert.match(root.innerHTML, /하루 필요 경험치/);
    assert.match(root.innerHTML, /현재 속도 예상 완료일/);
    assert.match(root.innerHTML, /시작 기록 중/);
    assert.match(root.innerHTML, /도움 되는 이벤트/);
    assert.match(root.innerHTML, /&lt;보상&amp;이벤트&gt;/);
    assert.match(root.innerHTML, /&lt;쿠폰&gt; · 조각&amp;메소/);
    assert.match(root.innerHTML, /D-\d+/);
    assert.ok(!root.innerHTML.includes("세 번째 보상"));
    ctx.events = [];
    renderGoalsTab(root, ctx);
    assert.ok(!root.innerHTML.includes("도움 되는 이벤트"));
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});

test("목표 폼: created·레벨 start·공통 deadline 저장, 비레벨은 로드맵 비율만 표시", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let saved = [];
  const noop = () => {};
  const field = (value) => ({ value, addEventListener: noop });
  const form = { dataset: { char: "0" }, type: field("level"), target: field("252"),
    elements: { deadline: field("2099-12-31") }, setupTemplate: field(""), setupText: field(""),
    core: field("*"), querySelectorAll: () => [], querySelector: () => ({}),
    addEventListener: (name, fn) => { if (name === "submit") form.submit = fn; } };
  const root = { innerHTML: "", querySelector: () => ({ addEventListener: noop }),
    querySelectorAll: (sel) => sel === ".goal-form" ? [form] : [] };
  const ctx = { chars: [{ basic: { character_name: "테스트", character_level: 250, character_exp: 20 },
    hexamatrix: [{ hexa_core_name: "코어", hexa_core_type: "스킬", hexa_core_level: 1 }] }],
  rules: { level: { exp: { 250: 100, 251: 200 } } }, setupTabs: noop };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => key === "maple-tracker:goals" ? JSON.stringify(saved) : null,
    setItem: (key, value) => { if (key === "maple-tracker:goals") saved = JSON.parse(value); },
  } });
  try {
    renderGoalsTab(root, ctx);
    assert.match(root.innerHTML, /name="deadline" type="date"/);
    form.submit({ preventDefault: noop });
    assert.ok(Number.isFinite(Date.parse(saved[0].created)));
    assert.deepEqual(saved[0].start, { level: 250, exp: 20 });
    assert.equal(saved[0].deadline, "2099-12-31");
    form.type.value = "hexa";
    form.target.value = "2";
    form.submit({ preventDefault: noop });
    assert.equal(saved[1].deadline, "2099-12-31");
    assert.equal(saved[1].start, undefined);
    assert.match(root.innerHTML, /로드맵 완료 <span data-roadmap-count>0\/1<\/span>/);
    assert.match(root.innerHTML, /남은 기간 \d+일/);
    saved[1].done = ["hexa-코어"];
    renderGoalsTab(root, ctx);
    assert.match(root.innerHTML, /value="1" data-roadmap-progress/);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
