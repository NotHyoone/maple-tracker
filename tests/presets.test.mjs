import { test } from "node:test";
import assert from "node:assert/strict";
import { availablePresets, pickPreset, diffItems } from "../web/js/presets.js";
import { characterPane } from "../web/js/render.js";

const item = (slot, fields = {}) => ({
  item_equipment_slot: slot, item_name: "장비", starforce: "17",
  potential_option_grade: "유니크", potential_option_1: "STR +9%",
  ...fields,
});
const character = (fields = {}) => ({
  basic: { character_name: "테스트", world_name: "스카니아", character_level: 280 },
  item: [item("무기")], ...fields,
});
const render = (c) => characterPane(c, null, new Map(), 0);

test("내용 있는 장비·어빌리티 프리셋 번호만 반환", () => {
  assert.deepEqual(availablePresets(undefined), []);
  assert.deepEqual(availablePresets(null), []);
  assert.deepEqual(availablePresets([]), []);
  assert.deepEqual(availablePresets([[], [item("무기")], []]), [2]);
  assert.deepEqual(availablePresets([null, { grade: "", lines: [] }, { grade: "레전드리", lines: ["옵션"] }]), [3]);
  assert.deepEqual(availablePresets([{ lines: ["옵션"] }, { grade: "유니크" }, null]), [1, 2]);
});

test("프리셋 선택은 1부터 시작하며 없는 번호는 null", () => {
  const presets = [[item("무기")], [], null];
  assert.equal(pickPreset(presets, 1), presets[0]);
  assert.equal(pickPreset(presets, "1"), presets[0]);
  assert.equal(pickPreset(presets, 2), presets[1]);
  for (const no of [0, -1, 1.5, 3, 4, null, undefined, "invalid"]) {
    assert.equal(pickPreset(presets, no), null);
  }
  assert.equal(pickPreset(undefined, 1), null);
});

test("장비 비교는 슬롯 기준이며 순서·아이콘·레벨 차이는 무시", () => {
  const base = [item("무기"), item("모자")];
  const other = [item("모자", { item_icon: "new.png", item_level: 200 }), item("무기", { starforce: 17 })];
  assert.deepEqual(diffItems(base, other), new Set());
  assert.deepEqual(diffItems(undefined, null), new Set());
  assert.deepEqual(diffItems([item("무기", { starforce: undefined })], [item("무기", { starforce: "0" })]), new Set());
});

test("이름·스타포스·잠재 및 에디셔널 등급과 모든 옵션 차이 감지", () => {
  const fields = ["item_name", "starforce", "potential_option_grade", "additional_potential_option_grade",
    "potential_option_1", "potential_option_2", "potential_option_3",
    "additional_potential_option_1", "additional_potential_option_2", "additional_potential_option_3"];
  for (const field of fields) {
    assert.deepEqual(diffItems([item("무기")], [item("무기", { [field]: "변경" })]), new Set(["무기"]), field);
  }
});

test("한쪽에만 존재하는 슬롯을 양방향으로 포함하고 입력을 보존", () => {
  const base = [item("무기"), item("모자")], other = [item("무기"), item("반지1")];
  const before = JSON.stringify([base, other]);
  assert.deepEqual(diffItems(base, other), new Set(["모자", "반지1"]));
  assert.deepEqual(diffItems(other, base), new Set(["반지1", "모자"]));
  assert.deepEqual(diffItems(undefined, other), new Set(["무기", "반지1"]));
  assert.equal(JSON.stringify([base, other]), before);
});

test("브라우저 전역 없이 모듈을 로드하고 이전 수집본 렌더링", () => {
  for (const name of ["document", "window", "localStorage"]) assert.equal(typeof globalThis[name], "undefined");
  const html = render(character());
  assert.match(html, /<h2>장비 /);
  assert.match(html, /장비<br>/);
  assert.doesNotMatch(html, /class="presets"|preset-body|class="diff"|어빌리티|하이퍼스탯/);
  assert.doesNotThrow(() => render(character({ item: undefined })));
});

test("장비 프리셋의 적용 번호 선택·빈 프리셋 제외·차이 행 표시", () => {
  const html = render(character({
    item_presets: [[item("무기", { starforce: "22" }), item("반지1")], [], [item("무기")]],
    item_preset_no: 3,
  }));
  assert.match(html, /data-p="1" class="" aria-pressed="false"/);
  assert.match(html, /data-p="3" class="on" aria-pressed="true">3 <span class="sub">적용 중/);
  assert.doesNotMatch(html, /data-p="2"/);
  assert.match(html, /class="preset-body" data-p="1" hidden/);
  assert.match(html, /class="preset-body" data-p="3">/);
  assert.equal((html.match(/<tr class="diff">/g) || []).length, 2);
  assert.doesNotMatch(html.split('class="preset-body" data-p="3">')[1], /class="diff"/);
});

test("적용 번호가 없거나 비어 있으면 첫 프리셋 선택, c.item과 비교", () => {
  for (const current of [undefined, null, 1, 4]) {
    const html = render(character({ item_presets: [[], [item("무기", { starforce: "22" })], []], item_preset_no: current }));
    assert.match(html, /data-p="2" class="on"/);
    assert.match(html, /class="preset-body" data-p="2">/);
    assert.match(html, /<tr class="diff">/);
    assert.doesNotMatch(html, /적용 중/);
  }
  assert.doesNotMatch(render(character({ item_presets: [[], [], []] })), /preset-body/);
});

test("장비가 비어도 프리셋 표 표시, 카드 순서와 그룹 구분", () => {
  const c = character({
    item: [], item_presets: [[item("무기")], [], []], item_preset_no: 1,
    ability: { grade: "유니크", lines: ["기본"], presets: [{ grade: "레전드리", lines: ["옵션"] }, null, null], preset_no: 1 },
    hyper_stat: { preset_no: 2, presets: [[], [{ stat_type: "데미지", stat_level: 10, stat_increase: "30%" }], []] },
  });
  const html = render(c);
  assert.ok(html.indexOf("<h2>장비") < html.indexOf("<h2>어빌리티"));
  assert.ok(html.indexOf("<h2>어빌리티") < html.indexOf("<h2>하이퍼스탯"));
  assert.match(html, /레전드리/);
  assert.match(html, /옵션/);
  assert.match(html, /데미지/);
  assert.match(html, /Lv\.10/);
  assert.match(html, /class="sub">30%/);
  const groups = [...html.matchAll(/class="presets" data-group="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(groups).size, 3);
  const other = render({ ...c, basic: { ...c.basic, character_name: "다른 캐릭터" } });
  for (const group of groups) assert.ok(!other.includes(`data-group="${group}"`));
});

test("프리셋 없는 어빌리티 표시, 빈 신규 데이터 카드 생략", () => {
  const html = render(character({ ability: { grade: "유니크", lines: ["옵션"] }, hyper_stat: { presets: [[], [], []] } }));
  assert.match(html, /<h2>어빌리티<\/h2>/);
  assert.match(html, /옵션/);
  assert.doesNotMatch(html, /하이퍼스탯|preset-body/);
  assert.doesNotMatch(render(character({ ability: { grade: null, lines: [], presets: [null, null, null] } })), /어빌리티/);
});

test("신규 데이터와 그룹 식별자의 HTML 특수문자를 이스케이프", () => {
  const unsafe = '<img src=x onerror="bad">';
  const html = render(character({
    basic: { character_name: unsafe, world_name: unsafe },
    item_presets: [[item("무기", { item_name: unsafe })]],
    ability: { presets: [{ grade: unsafe, lines: [unsafe] }] },
    hyper_stat: { presets: [[{ stat_type: unsafe, stat_level: unsafe, stat_increase: unsafe }]] },
  }));
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=&quot;bad&quot;&gt;/);
});
