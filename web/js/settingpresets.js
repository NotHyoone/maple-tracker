// 목표와 시세의 이름 붙인 스냅샷. DOM 없이 저장소를 주입해 사용할 수 있습니다.
import * as store from "./store.js";
import { normalizePrices } from "./calc/prices.js";

const KEY = "setting-presets";
const validGoals = (value) => Array.isArray(value)
  ? value.filter((g) => g && typeof g === "object" && !Array.isArray(g)) : [];

function presetName(name) {
  if (typeof name !== "string" || !name.trim()) throw new Error("프리셋 이름을 입력하세요.");
  return name.trim();
}

export function listPresets(s) {
  const raw = store.load(KEY, [], s);
  if (!Array.isArray(raw)) return [];
  return raw.filter((p) => p && typeof p.name === "string" && p.name.trim()).map((p) => ({
    name: p.name.trim(),
    saved_at: typeof p.saved_at === "string" ? p.saved_at : "",
    goals: validGoals(p.goals),
    ...(p.prices == null ? {} : { prices: normalizePrices(p.prices) }),
  }));
}

// 저장소 쓰기 실패는 store.save와 동일하게 false를 반환합니다.
export function savePreset(name, s, now = new Date()) {
  name = presetName(name);
  const presets = listPresets(s);
  const preset = {
    name, saved_at: now.toISOString(),
    goals: validGoals(store.load("goals", [], s)),
    prices: normalizePrices(store.load("prices", {}, s)),
  };
  const index = presets.findIndex((p) => p.name === name);
  if (index < 0) presets.push(preset);
  else presets[index] = preset;
  return store.save(KEY, presets, s);
}

export function applyPreset(name, s) {
  name = presetName(name);
  const preset = listPresets(s).find((p) => p.name === name);
  if (!preset) throw new Error("프리셋을 찾을 수 없습니다.");
  if (!store.save("goals", preset.goals, s)) return false;
  // 오래된 백업 등에서 시세가 빠졌다면 사용자가 입력한 기존 시세를 지우지 않습니다.
  // 두 키의 쓰기는 원자적이지 않으므로 시세 쓰기 실패 시 목표만 적용될 수 있습니다.
  return preset.prices === undefined || store.save("prices", preset.prices, s);
}

export function deletePreset(name, s) {
  name = presetName(name);
  return store.save(KEY, listPresets(s).filter((p) => p.name !== name), s);
}
