import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchSetup, setupPlan } from "../web/js/calc/setup.js";
import { tableFor, partCode, makePredicate, conditionProbability, expectedPotential } from "../web/js/calc/potential.js";
import { setupResult } from "../web/js/goals.js";

const read = (name) => JSON.parse(readFileSync(new URL(`../web/rules/${name}.json`, import.meta.url)));
const tables = read("potential"), meta = read("potential_meta"), rules = read("setups");
const hunt = rules.setups.find((s) => s.id === "hunt");
const ring = { item_equipment_slot: "반지1", item_equipment_part: "반지", item_name: "반지", item_level: 160, potential_option_grade: "레전드리" };
const weapon = { item_equipment_slot: "무기", item_equipment_part: "무기", item_name: "무기", item_level: 200, potential_option_grade: "레전드리" };
const plan = (items, extra = {}) => setupPlan({ items, tables, meta, setup: hunt, minLines: 1, kind: "main", mainStat: "STR", ...extra });

test("문장 매칭: 재획·보공·미일치, 공백·대소문자, 일치 수·동률", () => {
  assert.equal(matchSetup("재획 세팅 맞추고 싶어", rules.setups)?.id, "hunt");
  assert.equal(matchSetup("보공 올리고 싶다", rules.setups)?.id, "boss");
  assert.equal(matchSetup("모르는 말", rules.setups), null);
  assert.equal(matchSetup("보공 재 획 메 획", rules.setups)?.id, "hunt");
  assert.equal(matchSetup("보공 재획", rules.setups)?.id, "hunt");
  const custom = [{ id: "a", keywords: ["ABC"] }];
  assert.equal(matchSetup("a b C", custom)?.id, "a");
});

test("실제 표: 레전드리 반지 드롭·메획 가능, 무기는 불가; 기존 확률·비용과 동일", () => {
  const p = plan([weapon, ring]);
  assert.equal(p.todo.length, 1);
  assert.equal(p.todo[0].slot, "반지1");
  assert.deepEqual(p.todo[0].availableKinds, ["drop", "meso"]);
  assert.equal(p.impossible[0].slot, "무기");
  const probability = conditionProbability(tableFor(tables, "main", "legendary", partCode(tables, ring), 160),
    makePredicate({ mode: "lines", kinds: hunt.kinds, min: 1 }), meta.exclusive);
  assert.equal(p.todo[0].probability, probability);
  const e = expectedPotential(meta, { kind: "main", level: 160, fromGrade: "legendary", toGrade: "legendary", optionProb: probability });
  assert.equal(p.todo[0].attempts, e.attempts);
  assert.equal(p.todo[0].meso, e.meso);
});

test("현재 드롭 줄 충족: 표기와 API 콜론 표기 모두 분류", () => {
  for (const line of ["아이템 드롭률 +20%", "아이템 드롭률 : +20%"] ) {
    const p = plan([{ ...ring, potential_option_1: line }]);
    assert.equal(p.done.length, 1);
    assert.equal(p.done[0].meso, 0);
    assert.equal(p.nextSteps.length, 0);
  }
  assert.equal(plan([{ ...ring, potential_option_1: "아이템 드롭률 +20%" }], { minLines: 2 }).todo.length, 1);
});

test("유니크 반지는 레전드리 안내 및 승급 비용 포함", () => {
  const row = plan([{ ...ring, potential_option_grade: "유니크" }]).todo[0];
  assert.equal(row.higherGrade, true);
  assert.equal(row.targetGrade, "legendary");
  const e = expectedPotential(meta, { kind: "main", level: 160, fromGrade: "unique", toGrade: "legendary", optionProb: row.probability });
  assert.equal(row.meso, e.meso);
  assert.equal(row.attempts, e.attempts);
});

test("누락 필드·미수집 확률표·빈 장비: 예외 없고 비용을 추측하지 않음", () => {
  assert.doesNotThrow(() => plan([{}, { ...ring, potential_option_grade: undefined }]));
  assert.equal(plan([{}]).impossible[0].meso, null);
  assert.equal(plan([{ ...ring, potential_option_grade: undefined }]).todo[0].probability, null);
  assert.equal(plan([{ ...ring, item_level: 199 }]).impossible[0].meso, null);
  assert.deepEqual(plan([]), { done: [], todo: [], impossible: [], nextSteps: [] });
  const noCosts = { ...meta, cost: {} };
  const row = plan([ring], { meta: noCosts }).todo[0];
  assert.ok(row.attempts > 0);
  assert.equal(row.meso, null);
});

test("에디셔널 필드, 마력 분류, 확률순 정렬", () => {
  const additional = plan([{ ...ring, additional_potential_option_grade: "레전드리" }], { kind: "additional" }).todo[0];
  assert.ok(additional.probability > 0);
  assert.deepEqual(additional.availableKinds, ["drop", "meso"]);
  const boss = rules.setups.find((s) => s.id === "boss");
  assert.equal(plan([{ ...weapon, additional_potential_option_1: "마력 : +12%" }],
    { setup: boss, kind: "additional", mainStat: "INT" }).done.length, 1);
  const p = plan([{}, ring, { ...ring, item_equipment_slot: "반지2" }]);
  assert.equal(p.todo[0].slot, "반지1");
  assert.equal(p.todo[1].slot, "반지2");
  assert.equal(p.nextSteps[0].slot, "반지1");
});

test("잘못된 조건 거부", () => {
  for (const minLines of [0, 4, 1.5]) assert.throws(() => plan([ring], { minLines }));
  assert.throws(() => plan([ring], { setup: { kinds: ["unknown"] } }));
});

test("결과 카드 이스케이프 및 불가 장비를 제외한 합계", () => {
  const result = setupResult({ setup: "hunt", text: '<script>"&', min: 1, kind: "main" },
    { item: [ring, { ...weapon, item_name: "<img>" }] }, { rules: { potential: tables, potentialMeta: meta, setups: rules } });
  assert.ok(result.html.includes("&lt;script&gt;"));
  assert.ok(result.html.includes("&lt;img&gt;"));
  assert.ok(!result.html.includes("<script>"));
  assert.equal(result.meso, plan([ring]).todo[0].meso);
  assert.equal(result.hasMeso, true);
  assert.equal(result.partial, false);
});

test("확률표 없는 부위는 불가로 분류하고 작업 목록에서 제외", () => {
  const medal = { item_equipment_part: "훈장", item_name: "훈장", item_level: 200 };
  for (const item of [medal, {}]) {
    assert.equal(partCode(tables, item), null);
    const p = plan([ring, item]);
    assert.deepEqual(p.todo.map((r) => r.item), [ring]);
    assert.deepEqual(p.nextSteps.map((s) => s.slot), [ring.item_equipment_slot]);
    assert.equal(p.impossible.length, 1);
    assert.equal(p.impossible[0].item, item);
    assert.equal(p.impossible[0].note, "잠재능력 확률표가 없는 부위");
  }
  const result = setupResult({ setup: "hunt", min: 1, kind: "main" },
    { item: [ring, medal] }, { rules: { potential: tables, potentialMeta: meta, setups: rules } });
  assert.ok(!result.html.includes("훈장"));
  assert.equal(result.partial, false);
  assert.equal(result.meso, plan([ring]).todo[0].meso);
});

test("세팅 부분 합계는 todo의 미확인 비용만 반영", () => {
  const done = { ...ring, potential_option_1: "아이템 드롭률 +20%" };
  const unknown = { ...ring, item_equipment_slot: "반지2", potential_option_grade: undefined };
  const cases = [
    { items: [done, weapon], meso: 0, partial: false },
    { items: [weapon], meso: null, partial: false },
    { items: [], meso: null, partial: false },
    { items: [ring, done, weapon], meso: plan([ring]).todo[0].meso, partial: false },
    { items: [ring, done, weapon, unknown], meso: plan([ring]).todo[0].meso, partial: true },
    { items: [done, unknown], meso: 0, partial: true },
    { items: [unknown], meso: null, partial: true },
  ];
  for (const { items, meso, partial } of cases) {
    const result = setupResult({ setup: "hunt", min: 1, kind: "main" },
      { item: items }, { rules: { potential: tables, potentialMeta: meta, setups: rules } });
    assert.equal(result.meso, meso);
    assert.equal(result.partial, partial);
  }
});
