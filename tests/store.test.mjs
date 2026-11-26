import { test } from "node:test";
import assert from "node:assert/strict";
import * as store from "../web/js/store.js";

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
const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {}, length: 0, key: () => null };

test("save/load 왕복", () => {
  const s = memStorage();
  assert.equal(store.save("goals", [{ type: "level", target: 290 }], s), true);
  assert.deepEqual(store.load("goals", [], s), [{ type: "level", target: 290 }]);
  assert.equal(store.load("none", "fb", s), "fb");
});

test("저장소가 막혀도 예외 없이 기본값", () => {
  assert.equal(store.save("x", 1, broken), false);
  assert.equal(store.load("x", 42, broken), 42);
  assert.equal(store.available(broken), false);
});

test("내보내기 → 가져오기", () => {
  const a = memStorage();
  store.save("goals", [1, 2], a);
  store.save("prices", { 솔에르다조각: 1 }, a);
  a.setItem("other-app", "x"); // 다른 앱 키는 제외
  const backup = JSON.parse(JSON.stringify(store.exportAll(a)));
  assert.deepEqual(Object.keys(backup.data).sort(), ["goals", "prices"]);
  const b = memStorage();
  assert.equal(store.importAll(backup, b), 2);
  assert.deepEqual(store.load("prices", null, b), { 솔에르다조각: 1 });
});

test("잘못된 백업 거부", () => {
  assert.throws(() => store.importAll({ app: "other", data: {} }, memStorage()), /백업 파일이 아닙니다/);
  assert.throws(() => store.importAll(null, memStorage()));
  assert.throws(() => store.importAll({ app: "maple-tracker", version: 99, data: {} }, memStorage()), /새로운 버전/);
});
