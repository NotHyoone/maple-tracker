import { test } from "node:test";
import assert from "node:assert/strict";
import * as store from "../web/js/store.js";
import { listPresets, savePreset, applyPreset, deletePreset } from "../web/js/settingpresets.js";

function memStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const now = new Date("2026-11-27T01:02:03.000Z");
const goals = [{ id: "a", type: "level", target: 290, extra: { value: 1 } }];
const prices = { fragment: { value: 123000, updated: "2026-11-27" } };

test("현재 설정 저장 → 불러오기 왕복과 스냅샷 독립성", () => {
  const s = memStorage();
  store.save("goals", goals, s);
  store.save("prices", prices, s);
  assert.equal(savePreset("  본캐  ", s, now), true);
  assert.deepEqual(listPresets(s), [{ name: "본캐", saved_at: now.toISOString(), goals, prices }]);
  const listed = listPresets(s);
  listed[0].goals[0].extra.value = 99;
  listed[0].prices.fragment.value = 1;
  store.save("goals", [], s);
  store.save("prices", {}, s);
  assert.equal(applyPreset(" 본캐 ", s), true);
  assert.deepEqual(store.load("goals", null, s), goals);
  assert.deepEqual(store.load("prices", null, s), prices);
});

test("같은 이름은 목록 위치를 유지하며 내용과 시각 덮어쓰기", () => {
  const s = memStorage();
  savePreset("첫째", s, now);
  savePreset("둘째", s, now);
  store.save("goals", goals, s);
  store.save("prices", prices, s);
  const later = new Date(now.getTime() + 1000);
  assert.equal(savePreset(" 첫째 ", s, later), true);
  assert.deepEqual(listPresets(s).map((p) => p.name), ["첫째", "둘째"]);
  assert.deepEqual(listPresets(s)[0], { name: "첫째", saved_at: later.toISOString(), goals, prices });
});

test("빈 이름은 오류이며 저장하지 않음", () => {
  const s = memStorage();
  for (const name of ["", " \n ", null, 42]) {
    assert.throws(() => savePreset(name, s, now), /이름/);
  }
  assert.equal(s.length, 0);
});

test("없는 이름 적용은 오류이며 현재 설정 보존", () => {
  const s = memStorage();
  store.save("goals", goals, s);
  store.save("prices", prices, s);
  assert.throws(() => applyPreset("없음", s), /찾을 수 없습니다/);
  assert.deepEqual(store.load("goals", null, s), goals);
  assert.deepEqual(store.load("prices", null, s), prices);
});

test("삭제는 해당 프리셋만 제거하고 현재 설정 유지", () => {
  const s = memStorage();
  store.save("goals", goals, s);
  savePreset("첫째", s, now);
  savePreset("둘째", s, now);
  assert.equal(deletePreset(" 첫째 ", s), true);
  assert.deepEqual(listPresets(s).map((p) => p.name), ["둘째"]);
  assert.deepEqual(store.load("goals", null, s), goals);
  assert.equal(deletePreset("없음", s), true);
});

test("깨진 JSON과 배열 아닌 저장값은 빈 목록으로 처리", () => {
  const s = memStorage();
  for (const raw of ["{", "null", "42", '"text"', '{}']) {
    s.setItem("maple-tracker:setting-presets", raw);
    assert.deepEqual(listPresets(s), []);
    assert.equal(savePreset("새 설정", s, now), true);
    assert.equal(listPresets(s).length, 1);
  }
});

test("이름 없는 항목 무시 및 깨진 목표·시세 안전 처리", () => {
  const s = memStorage();
  store.save("setting-presets", [null, 1, {}, { name: 42 }, { name: " " },
    { name: "정상", goals: [null, 1, [], ...goals], prices: { fragment: { value: -1 } } },
    { name: "빈 목표", goals: {}, prices: [] }], s);
  assert.equal(listPresets(s).length, 2);
  assert.equal(applyPreset("정상", s), true);
  assert.deepEqual(store.load("goals", null, s), goals);
  assert.deepEqual(store.load("prices", null, s), {});
  assert.equal(applyPreset("빈 목표", s), true);
  assert.deepEqual(store.load("goals", null, s), []);
  store.save("goals", null, s);
  store.save("prices", "깨짐", s);
  savePreset("새 설정", s, now);
  assert.deepEqual(listPresets(s)[2].goals, []);
  assert.deepEqual(listPresets(s)[2].prices, {});
});

test("시세 없는 프리셋은 기존 시세 유지, 빈 시세는 명시적으로 적용", () => {
  const s = memStorage();
  store.save("prices", prices, s);
  store.save("setting-presets", [{ name: "이전", goals }, { name: "비움", goals: [], prices: {} }], s);
  assert.equal(applyPreset("이전", s), true);
  assert.deepEqual(store.load("prices", null, s), prices);
  assert.equal(applyPreset("비움", s), true);
  assert.deepEqual(store.load("prices", null, s), {});
});

test("저장 차단 시 저장·적용·삭제는 모두 false", () => {
  const s = memStorage();
  savePreset("설정", s, now);
  s.setItem = () => { throw new Error("blocked"); };
  assert.equal(savePreset("설정", s, now), false);
  assert.equal(applyPreset("설정", s), false);
  assert.equal(deletePreset("설정", s), false);
  assert.equal(listPresets(s).length, 1);
});

test("시세만 쓰기 실패해도 적용 결과는 false", () => {
  const s = memStorage();
  store.save("goals", goals, s);
  savePreset("설정", s, now);
  store.save("goals", [], s);
  const setItem = s.setItem;
  s.setItem = (k, v) => {
    if (k === "maple-tracker:prices") throw new Error("blocked");
    setItem(k, v);
  };
  assert.equal(applyPreset("설정", s), false);
  assert.deepEqual(store.load("goals", null, s), goals);
});

test("프리셋은 exportAll 백업에 자동 포함되고 가져오기 가능", () => {
  const s = memStorage();
  savePreset("백업", s, now);
  const backup = store.exportAll(s);
  assert.deepEqual(backup.data["setting-presets"], listPresets(s));
  const restored = memStorage();
  assert.equal(store.importAll(backup, restored), 1);
  assert.deepEqual(listPresets(restored), listPresets(s));
});
