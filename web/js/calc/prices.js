// 시세(사용자가 직접 입력, 브라우저 저장)와 메소 환산

/** 시세 항목 정의. unit: 입력 단위 배수 (조각 가격은 '만 메소' 단위로 입력) */
export const PRICE_ITEMS = {
  fragment: { label: "솔 에르다 조각 1개", unit: 1e4, unitLabel: "만 메소", hint: "경매장 최근 거래가" },
  mpPer100m: { label: "메소 시세 (1억 메소당 메이플포인트)", unit: 1, unitLabel: "포인트", hint: "메소마켓 시세. 1포인트 = 1원으로 환산" },
};

export const STALE_DAYS = 14;

/** 저장된 시세에서 유효한 값만 꺼냄: { key: { value(실제 메소/포인트), updated } } */
export function normalizePrices(raw) {
  const out = {};
  for (const key of Object.keys(PRICE_ITEMS)) {
    const p = raw?.[key];
    const v = Number(p?.value);
    if (p && Number.isFinite(v) && v > 0) out[key] = { value: v, updated: p.updated ?? null };
  }
  return out;
}

/** 입력칸 값(단위 적용 전) → 저장할 항목. 비우거나 0 이하면 null(삭제) */
export function priceFromInput(key, text, now = new Date()) {
  const n = Number(String(text ?? "").replace(/,/g, "").trim());
  if (!(n > 0) || !Number.isFinite(n)) return null;
  return { value: n * PRICE_ITEMS[key].unit, updated: now.toISOString().slice(0, 10) };
}

/** 시세 입력 후 지난 일수 (날짜 없으면 null) */
export function ageDays(updated, now = Date.now()) {
  const t = Date.parse(updated ?? "");
  return Number.isNaN(t) ? null : Math.floor((now - t) / 864e5);
}

export const isStale = (updated, now = Date.now()) => {
  const d = ageDays(updated, now);
  return d != null && d >= STALE_DAYS;
};

/** 조각 개수 → 메소. 시세가 없으면 null */
export function fragmentsToMeso(fragments, prices) {
  return prices.fragment && fragments != null ? fragments * prices.fragment.value : null;
}

/** 메소 → 원 (메이플포인트 1 = 1원). 시세가 없으면 null */
export function mesoToWon(meso, prices) {
  return prices.mpPer100m && meso != null ? Math.round((meso / 1e8) * prices.mpPer100m.value) : null;
}

/**
 * 여러 목표의 메소를 합칠 때: 값이 있는 것만 더하고, 빠진 것이 있는지 표시.
 * items: [{meso: number|null, partial?: boolean}]
 */
export function sumMeso(items) {
  let total = 0, known = 0, missing = 0;
  for (const it of items) {
    if (it.meso == null) { missing++; continue; }
    total += it.meso; known++;
    if (it.partial) missing++;
  }
  return { total: known ? total : null, incomplete: missing > 0 };
}
