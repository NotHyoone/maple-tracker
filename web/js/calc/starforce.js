// 스타포스 기댓값 계산. rules = web/rules/starforce.json
//
// 상태 = 현재 성급. 한 번 시도하면
//   성공 → 다음 성급 (1+1 이벤트면 2단계), 실패 → 그대로(15성 이상 하락 없음, 14성 이하 파괴 없음),
//   파괴 → 흔적 성급(min(n, 22))에서 같은 장비로 복구 후 재도전
// 목표 성급에 도달하면 끝.

export const has = (opt, ev) => (opt.events || []).includes(ev);

export function maxStar(rules, level) {
  for (const [lv, max] of rules.max_star_by_level) if (level <= lv) return max;
  return 0;
}

/** n성 → n+1 시도 확률 {success, keep, destroy} */
export function odds(rules, n, opt = {}) {
  const p = rules.probs[n];
  if (!p) return { success: 0, keep: 1, destroy: 0 };
  if (has(opt, "fiveTenFifteen") && [5, 10, 15].includes(n)) return { success: 1, keep: 0, destroy: 0 };
  const failBase = 1 - p.success;
  const destroyShare = failBase > 0 ? p.destroy / failBase : 0; // 실패 중 파괴 비율
  const success = Math.min(1, opt.starcatch ? p.success * rules.starcatch.success_multiplier : p.success);
  let destroy = (1 - success) * destroyShare;
  if ((opt.safeguard || []).includes(n) && rules.safeguard.stars.includes(n)) destroy = 0;
  if (has(opt, "destroy30") && n <= 21) destroy *= 0.7;
  return { success, keep: Math.max(0, 1 - success - destroy), destroy };
}

export function baseCost(rules, level, n) {
  const c = rules.cost, L3 = level ** 3;
  if (n <= 9) return 100 * Math.round(10 + (L3 * (n + 1)) / c.low_divisor);
  const div = c.divisors[String(n)] ?? c.default_divisor;
  return 100 * Math.round(10 + (L3 * (n + 1) ** 2.7) / div);
}

/** 1회 시도 메소 (할인·파괴 방지 반영) */
export function attemptCost(rules, level, n, opt = {}) {
  const base = baseCost(rules, level, n);
  let c = base;
  if (has(opt, "cost30")) c *= 0.7;
  if (n < rules.discounts.mvp_and_pcroom_below_star) {
    c *= 1 - (Number(opt.mvp) || 0);
    if (opt.pcroom) c *= 1 - rules.discounts.pcroom;
  }
  const guarded = (opt.safeguard || []).includes(n) && rules.safeguard.stars.includes(n)
    && !(has(opt, "fiveTenFifteen") && n === 15);
  if (guarded) c += rules.safeguard.extra_cost_multiplier * base; // 파괴 방지 추가분은 할인 안 됨
  return 100 * Math.round(c / 100);
}

export function nextStar(n, target, max, opt = {}) {
  const step = has(opt, "onePlusOne") && n <= 10 ? 2 : 1;
  return Math.min(n + step, target, max);
}

/** 파괴 시 {star: 흔적 성급, items: 복구에 필요한 같은 장비 수} */
export function trace(rules, n) {
  const t = rules.trace;
  if (n < t.min_star) return { star: n, items: 0 }; // 14성 이하는 파괴되지 않음
  const star = Math.min(n, t.cap_star);
  const items = t.items_needed.find(([upTo]) => star <= upTo)[1];
  return { star, items };
}

/** 작은 연립방정식 풀이 (부분 피벗 가우스 소거) */
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || M[c][c] === 0) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function lowestState(rules, from, to) {
  let low = from;
  for (let n = from; n < to; n++) low = Math.min(low, trace(rules, n).star);
  return low;
}

/**
 * 정확한 기댓값.
 * p = {level, from, to, starcatch, safeguard[], events[], mvp, pcroom, replacementPrice, restoreMeso}
 * 반환 {meso: 강화 메소, booms, attempts, items: 복구용 장비 수, extraMeso: 장비+복구 메소, total, noBoomRate, steps[]}
 */
export function expected(rules, p) {
  const max = maxStar(rules, p.level);
  const to = Math.min(p.to, max);
  const from = Math.max(0, p.from);
  if (to <= from) return { meso: 0, booms: 0, attempts: 0, items: 0, extraMeso: 0, total: 0, noBoomRate: 1, steps: [], max, to };
  const low = lowestState(rules, from, to);
  const states = [];
  for (let n = low; n < to; n++) states.push(n);
  const idx = new Map(states.map((n, i) => [n, i]));
  const size = states.length;
  const A = states.map(() => Array(size).fill(0));
  const rhs = { meso: [], booms: [], attempts: [], items: [] };
  for (const n of states) {
    const i = idx.get(n), o = odds(rules, n, p), nx = nextStar(n, to, max, p), tr = trace(rules, n);
    A[i][i] += 1 - o.keep;
    if (idx.has(nx)) A[i][idx.get(nx)] -= o.success;
    if (o.destroy > 0) A[i][idx.get(tr.star)] -= o.destroy;
    rhs.meso.push(attemptCost(rules, p.level, n, p));
    rhs.attempts.push(1);
    rhs.booms.push(o.destroy);
    rhs.items.push(o.destroy * tr.items);
  }
  const sol = Object.fromEntries(Object.entries(rhs).map(([k, b]) => [k, solve(A, b)]));
  const at = (k) => sol[k][idx.get(from)];

  // 파괴 없이 목표까지 갈 확률: 각 단계에서 (성공)/(성공+파괴)
  let noBoomRate = 1;
  for (let n = from; n < to; n = nextStar(n, to, max, p)) {
    const o = odds(rules, n, p);
    noBoomRate *= o.success + o.destroy > 0 ? o.success / (o.success + o.destroy) : 1;
  }
  const items = at("items"), booms = at("booms");
  const extraMeso = items * (Number(p.replacementPrice) || 0) + booms * (Number(p.restoreMeso) || 0);
  const steps = [];
  for (let n = from; n < to; n++) {
    const o = odds(rules, n, p);
    steps.push({ star: n, cost: attemptCost(rules, p.level, n, p), ...o });
  }
  return { meso: at("meso"), booms, attempts: at("attempts"), items, extraMeso, total: at("meso") + extraMeso, noBoomRate, steps, max, to };
}

/** 재현 가능한 난수 (테스트용 시드) */
export function rng32(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/**
 * 모의 시행으로 비용 분포. 시간이 오래 걸리는 목표(28→30성 등)를 위해 시도 횟수 한도(maxSteps)를 둡니다.
 * 반환 {runs, total: {p10,p50,p90,p99}, booms: {...}, truncated}
 */
export function simulate(rules, p, { runs = 10000, maxSteps = 2e7, random = Math.random, deadline = Infinity } = {}) {
  const max = maxStar(rules, p.level);
  const to = Math.min(p.to, max);
  if (to <= p.from) return null;
  const table = new Map();
  for (let n = lowestState(rules, p.from, to); n < to; n++) {
    table.set(n, { o: odds(rules, n, p), cost: attemptCost(rules, p.level, n, p), next: nextStar(n, to, max, p), tr: trace(rules, n) });
  }
  const repl = Number(p.replacementPrice) || 0, restore = Number(p.restoreMeso) || 0;
  const totals = [], booms = [];
  let steps = 0, truncated = false;
  for (let r = 0; r < runs; r++) {
    let n = p.from, cost = 0, b = 0;
    while (n < to) {
      const s = table.get(n), x = random();
      cost += s.cost; steps++;
      if (x < s.o.success) n = s.next;
      else if (x < s.o.success + s.o.destroy) { b++; cost += s.tr.items * repl + restore; n = s.tr.star; }
    }
    totals.push(cost); booms.push(b);
    if (steps > maxSteps || (r % 200 === 0 && Date.now() > deadline)) { truncated = r + 1 < runs; break; }
  }
  const q = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return { p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9), p99: quantile(s, 0.99), mean: s.reduce((a, v) => a + v, 0) / s.length };
  };
  return { runs: totals.length, total: q(totals), booms: q(booms), truncated };
}
