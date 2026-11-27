// 프리셋 선택과 장비 비교 — DOM에 의존하지 않는 순수 함수.
export function availablePresets(list) {
  if (!Array.isArray(list)) return [];
  return list.flatMap((preset, i) => {
    const filled = Array.isArray(preset) ? preset.length > 0 :
      preset && (preset.grade || preset.lines?.length);
    return filled ? [i + 1] : [];
  });
}

export function pickPreset(presets, no) {
  const n = Number(no);
  return Array.isArray(presets) && Number.isInteger(n) && n >= 1 ? presets[n - 1] ?? null : null;
}

const ITEM_FIELDS = ["item_name", "starforce", "potential_option_grade",
  "potential_option_1", "potential_option_2", "potential_option_3",
  "additional_potential_option_grade", "additional_potential_option_1",
  "additional_potential_option_2", "additional_potential_option_3"];

export function diffItems(base, other) {
  const bySlot = (items) => new Map((Array.isArray(items) ? items : [])
    .filter((it) => it?.item_equipment_slot)
    .map((it) => [it.item_equipment_slot, it]));
  const a = bySlot(base), b = bySlot(other);
  const changed = new Set();
  for (const slot of new Set([...a.keys(), ...b.keys()])) {
    const left = a.get(slot), right = b.get(slot);
    if (!left || !right || ITEM_FIELDS.some((key) =>
      String(left[key] ?? (key === "starforce" ? "0" : "")) !==
      String(right[key] ?? (key === "starforce" ? "0" : "")))) changed.add(slot);
  }
  return changed;
}
