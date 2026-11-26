import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  conditionProbability, makePredicate, tierAttempts, expectedPotential, potentialQuantiles, tableFor, levelBracket, resetCost, KINDS,
} from "../web/js/calc/potential.js";

const T = JSON.parse(readFileSync(new URL("../web/rules/potential.json", import.meta.url)));
const M = JSON.parse(readFileSync(new URL("../web/rules/potential_meta.json", import.meta.url)));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("확률 합 = 1, 첫 줄 하나만 보는 조건 = 첫 줄 표기 확률", () => {
  const lines = tableFor(T, "main", "legendary", 1, 200);
  close(conditionProbability(lines, () => true, M.exclusive), 1, 1e-5); // 공식 표기 확률 반올림 오차
  const [name, p] = lines[0][0];
  close(conditionProbability(lines, (n) => n[0] === name, M.exclusive), p, 1e-6);
});

test("제한 없는 옵션: 보스 1줄 이상 = 1 − Π(1 − 줄별 보스 확률)", () => {
  const lines = tableFor(T, "main", "legendary", 1, 200);
  const boss = (line) => line.filter(([n]) => KINDS.boss.value(n) > 0).reduce((s, [, p]) => s + p, 0);
  const expected = 1 - lines.reduce((acc, line) => acc * (1 - boss(line)), 1);
  close(conditionProbability(lines, makePredicate({ mode: "lines", kinds: ["boss"], min: 1 }), M.exclusive), expected, 1e-5);
});

test("중복 제한: 최대 1줄 계열은 다음 줄에서 빠지고 재정규화", () => {
  const ex = { max1: ["^<쓸만한"], max2: [] };
  const lines = [[["<쓸만한 A>", 0.5], ["X", 0.5]], [["<쓸만한 A>", 0.5], ["Y", 0.5]], [["Z", 1]]];
  // 첫 줄이 쓸만한이면 둘째 줄은 Y 확정, 아니면 50:50 → 쓸만한 2줄 확률 0
  close(conditionProbability(lines, (n) => n.filter((x) => x.startsWith("<쓸만한")).length === 2, ex), 0);
  close(conditionProbability(lines, (n) => n[1] === "Y", ex), 0.5 * 1 + 0.5 * 0.5);
  // 제한이 없으면 독립
  close(conditionProbability(lines, (n) => n[1] === "Y", { max1: [], max2: [] }), 0.5);
});

test("조건: 주스탯 %는 올스탯도 합산", () => {
  const pred = makePredicate({ mode: "sum", kind: "stat", stat: "INT", min: 30 });
  assert.equal(pred(["INT +12%", "올스탯 +9%", "INT +9%"]), true);
  assert.equal(pred(["INT +12%", "LUK +12%", "INT +9%"]), false);
  assert.equal(makePredicate({ mode: "sum", kind: "atk", atk: "마력", min: 21 })(["마력 +12%", "공격력 +12%", "마력 +9%"]), true);
  assert.equal(makePredicate({ mode: "sum", kind: "cooldown", min: 4 })(["스킬 재사용 대기시간 -2초", "스킬 재사용 대기시간 -2초", "INT +9%"]), true);
});

test("등급 상승: 천장 반영 평균 시도 수", () => {
  close(tierAttempts(0.5, 0), 2);
  close(tierAttempts(0.014, 107), (1 - 0.986 ** 107) / 0.014);
  assert.ok(tierAttempts(0.014, 107) < 1 / 0.014);
});

test("비용: 공식 표 (200~249제 레전드리 4,500만)", () => {
  assert.equal(levelBracket(M, 200), "200-249");
  assert.equal(resetCost(M, "main", 250, "legendary"), 50000000);
  const e = expectedPotential(M, { kind: "main", level: 200, fromGrade: "unique", toGrade: "legendary", optionProb: null });
  close(e.meso, tierAttempts(0.014, 107) * 38250000, 1e-3);
  const e2 = expectedPotential(M, { kind: "main", level: 200, fromGrade: "legendary", toGrade: "legendary", optionProb: 0.01 });
  close(e2.meso, 100 * 45000000, 1e-3);
});

test("메소 구간은 순서대로", () => {
  const q = potentialQuantiles(M, { kind: "main", level: 200, fromGrade: "epic", toGrade: "legendary", optionProb: 0.05 });
  assert.ok(q.p10 <= q.p50 && q.p50 <= q.p90 && q.p90 <= q.p99);
});
