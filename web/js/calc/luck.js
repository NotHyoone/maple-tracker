// 내 운 vs 기댓값: 사용 기록 집계(history)를 확률 모델과 비교
import { odds } from "./starforce.js";
import { resetCost } from "./potential.js";

/** 표준정규 누적분포 (Abramowitz-Stegun 근사) */
export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/**
 * 관측 성공 수가 기댓값보다 얼마나 운이 좋은지: 0~1 (1 = 최고로 운 좋음). 표본이 적으면 null.
 * 각 시도의 확률이 달라도 되도록 평균·분산을 합친 정규근사. 기댓값과 같으면 0.5
 */
export function luckPercentile(observed, mean, variance) {
  if (!(variance > 0) || mean < 3) return null;
  return normCdf((observed - mean) / Math.sqrt(variance));
}

const inRange = (day, since) => !since || day >= since;

// ---------- 스타포스 ----------

/**
 * history: {날짜: {starforce: {"성급|catch|guard|special": {success,keep,down,destroy}}}}
 * since: 비교 시작일 (확률 개편 이후만 비교)
 */
export function starforceLuck(history, rules, { since = null } = {}) {
  const rows = new Map();
  let excluded = 0;
  const tot = { n: 0, success: 0, expSuccess: 0, varSuccess: 0, destroy: 0, expDestroy: 0, varDestroy: 0 };
  for (const [day, d] of Object.entries(history || {})) {
    for (const [key, c] of Object.entries(d.starforce || {})) {
      const n = c.success + c.keep + c.down + c.destroy;
      const [starS, catchR, guard, special] = key.split("|");
      const star = Number(starS);
      if (!inRange(day, since) || special !== "none" || !rules.probs[star]) { excluded += n; continue; }
      const o = odds(rules, star, { starcatch: catchR === "success", safeguard: guard === "guard" ? [star] : [] });
      const r = rows.get(star) || { star, n: 0, success: 0, expSuccess: 0, destroy: 0, expDestroy: 0 };
      r.n += n; r.success += c.success; r.destroy += c.destroy;
      r.expSuccess += n * o.success; r.expDestroy += n * o.destroy;
      rows.set(star, r);
      tot.n += n; tot.success += c.success; tot.destroy += c.destroy;
      tot.expSuccess += n * o.success; tot.varSuccess += n * o.success * (1 - o.success);
      tot.expDestroy += n * o.destroy; tot.varDestroy += n * o.destroy * (1 - o.destroy);
    }
  }
  return {
    rows: [...rows.values()].sort((a, b) => a.star - b.star),
    total: tot,
    excluded,
    successLuck: luckPercentile(tot.success, tot.expSuccess, tot.varSuccess),
    // 파괴는 적을수록 운이 좋음
    destroyLuck: (() => { const p = luckPercentile(tot.destroy, tot.expDestroy, tot.varDestroy); return p == null ? null : 1 - p; })(),
  };
}

// ---------- 잠재능력 (큐브·메소 재설정) ----------

/** 기록의 재설정 이름 → 등급 상승 확률표 */
export function tierRatesFor(meta, kind, name) {
  if (kind === "additional") return /큐브/.test(name) ? meta.tier_other.additionalCube : rateMap(meta.tier.additional);
  if (/레드/.test(name)) return meta.tier_other.red;
  if (/블랙|재설정/.test(name)) return rateMap(meta.tier.main);
  return null; // 수상한/장인/명장 큐브 등은 비교하지 않음
}
const rateMap = (t) => Object.fromEntries(Object.entries(t).map(([g, v]) => [g, v.rate]));

/**
 * history[날짜].potential["kind|이름|등급|normal/miracle"] = {n, up, guaranteed, levels}
 * 반환 {rows: [{kind, name, grade, n, up, expUp, luck}], total, mesoByMonth, excluded}
 */
export function potentialLuck(history, meta, { since = null } = {}) {
  const rows = new Map();
  const mesoByMonth = {};
  let excluded = 0;
  const tot = { n: 0, up: 0, expUp: 0, varUp: 0 };
  for (const [day, d] of Object.entries(history || {})) {
    for (const [key, c] of Object.entries(d.potential || {})) {
      const [kind, name, grade, time] = key.split("|");
      // 메소 재설정 지출 (미라클 포함, 실제로 쓴 메소)
      if (/재설정/.test(name)) {
        let meso = 0;
        for (const [lv, cnt] of Object.entries(c.levels || {})) meso += (resetCost(meta, kind, Number(lv), grade) || 0) * cnt;
        const m = day.slice(0, 7);
        mesoByMonth[m] = (mesoByMonth[m] || 0) + meso;
      }
      const rates = tierRatesFor(meta, kind, name);
      const rate = rates?.[grade];
      if (!inRange(day, since) || time === "miracle" || !rate) { excluded += c.n; continue; }
      const n = c.n - c.guaranteed; // 천장으로 확정된 시도는 확률 비교에서 제외
      const k = `${kind}|${name}|${grade}`;
      const r = rows.get(k) || { kind, name, grade, n: 0, up: 0, expUp: 0, varUp: 0, guaranteed: 0 };
      r.n += n; r.up += c.up; r.expUp += n * rate; r.varUp += n * rate * (1 - rate); r.guaranteed += c.guaranteed;
      rows.set(k, r);
      tot.n += n; tot.up += c.up; tot.expUp += n * rate; tot.varUp += n * rate * (1 - rate);
    }
  }
  const list = [...rows.values()].map((r) => ({ ...r, luck: luckPercentile(r.up, r.expUp, r.varUp) }));
  return { rows: list, total: { ...tot, luck: luckPercentile(tot.up, tot.expUp, tot.varUp) }, mesoByMonth, excluded };
}

/** 0~1 운 백분위 → 사람이 읽는 문장 */
export function luckText(p) {
  if (p == null) return "표본이 적어 판단 보류";
  if (p >= 0.5) return `상위 ${Math.max(1, Math.round((1 - p) * 100))}% 수준으로 운이 좋음`;
  return `하위 ${Math.max(1, Math.round(p * 100))}% 수준으로 운이 나쁨`;
}
