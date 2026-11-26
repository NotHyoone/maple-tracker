import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { starforceLuck, potentialLuck, luckPercentile, normCdf, luckText, tierRatesFor } from "../web/js/calc/luck.js";

const SF = JSON.parse(readFileSync(new URL("../web/rules/starforce.json", import.meta.url)));
const PM = JSON.parse(readFileSync(new URL("../web/rules/potential_meta.json", import.meta.url)));
const close = (a, b, eps) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("정규분포 근사", () => {
  close(normCdf(0), 0.5, 1e-6); close(normCdf(1.96), 0.975, 1e-3); close(normCdf(-1.96), 0.025, 1e-3);
  assert.equal(luckPercentile(1, 1, 0.9), null); // 기대 성공 3회 미만은 판단 보류
  close(luckPercentile(50, 50, 25), 0.5, 1e-6);
});

test("스타포스: 기대 성공·파괴 계산과 제외 규칙", () => {
  const h = {
    "2025-05-01": { starforce: {
      "15|success|noguard|none": { success: 315, keep: 664, down: 0, destroy: 21 },  // 정확히 기댓값
      "15|success|noguard|event": { success: 10, keep: 0, down: 0, destroy: 0 },     // 이벤트 → 제외
      "16|fail|guard|none": { success: 30, keep: 70, down: 0, destroy: 0 },          // 파괴 방지, 스타캐치 실패
    } },
    "2024-01-01": { starforce: { "15|success|noguard|none": { success: 0, keep: 0, down: 50, destroy: 50 } } }, // 개편 전 → 제외
  };
  const r = starforceLuck(h, SF, { since: SF.compare_since });
  assert.equal(r.excluded, 110);
  const s15 = r.rows.find((x) => x.star === 15);
  close(s15.expSuccess, 1000 * 0.315, 1e-6); close(s15.expDestroy, 1000 * 0.02055, 1e-6);
  const s16 = r.rows.find((x) => x.star === 16);
  close(s16.expSuccess, 30, 1e-9); close(s16.expDestroy, 0, 1e-12);
  close(r.successLuck, 0.5, 0.01);
  assert.ok(r.destroyLuck > 0.45 && r.destroyLuck < 0.55);
});

test("스타포스: 성공이 많으면 운 좋음, 파괴가 많으면 운 나쁨", () => {
  const h = { "2025-05-01": { starforce: { "17|success|noguard|none": { success: 300, keep: 600, down: 0, destroy: 100 } } } };
  const r = starforceLuck(h, SF, { since: SF.compare_since });
  assert.ok(r.successLuck > 0.99, String(r.successLuck)); // 기대 157.5회
  assert.ok(r.destroyLuck < 0.01, String(r.destroyLuck)); // 기대 약 57회
  assert.match(luckText(r.successLuck), /상위/);
  assert.match(luckText(r.destroyLuck), /하위/);
});

test("잠재능력: 천장 확정·미라클 제외, 재설정 메소 합계", () => {
  const h = {
    "2025-06-10": { potential: {
      "main|잠재능력 재설정|unique|normal": { n: 1001, up: 14, guaranteed: 1, levels: { "200": 1001 } },
      "main|잠재능력 재설정|unique|miracle": { n: 100, up: 3, guaranteed: 0, levels: { "200": 100 } },
      "main|수상한 큐브|rare|normal": { n: 5, up: 0, guaranteed: 0, levels: {} },
    } },
  };
  const r = potentialLuck(h, PM);
  assert.equal(r.excluded, 105);
  const row = r.rows[0];
  assert.equal(row.n, 1000); close(row.expUp, 14, 1e-9); close(row.luck, 0.5, 1e-6);
  assert.equal(r.mesoByMonth["2025-06"], 1101 * 38250000);
});

test("재설정 종류별 확률표", () => {
  assert.equal(tierRatesFor(PM, "main", "블랙 큐브").unique, 0.014);
  assert.equal(tierRatesFor(PM, "additional", "에디셔널 잠재능력 재설정").rare, 0.02381);
  assert.equal(tierRatesFor(PM, "additional", "화이트 에디셔널 큐브").rare, 0.047619);
  assert.equal(tierRatesFor(PM, "main", "명장의 큐브"), null);
});

test("스타캐치 정보 없음: 했다/안 했다 두 가정", () => {
  const h = { "2025-05-01": { starforce: { "17|none|noguard|none": { success: 16, keep: 70, down: 0, destroy: 14 } } } };
  const r = starforceLuck(h, SF, { since: SF.compare_since });
  assert.equal(r.total.unknownCatch, 100);
  close(r.total.expSuccess, 15.75, 1e-9);   // 스타캐치 가정
  close(r.total.expSuccessB, 15, 1e-9);     // 안 했다고 가정
  assert.ok(r.successLuckB > r.successLuck);
});

test("메멘토·펄스 인핸서는 비교 제외, 이름이 정확한 큐브만", () => {
  assert.equal(tierRatesFor(PM, "additional", "메멘토 브론즈 에디셔널 큐브 (200제)"), null);
  assert.equal(tierRatesFor(PM, "main", "메멘토 골드 큐브 (200제)"), null);
  assert.equal(tierRatesFor(PM, "main", "펄스 인핸서"), null);
  assert.equal(tierRatesFor(PM, "main", "카르마 블랙 큐브").unique, 0.014);
  assert.equal(tierRatesFor(PM, "additional", "카르마 화이트 에디셔널 큐브").epic, 0.019608);
});
