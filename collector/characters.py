"""내 캐릭터 정보 수집 + 일별 기록."""
from __future__ import annotations

from .nexon import Client, NexonError
from .util import DATA, now_kst, read_json, safe_name, write_json

CHAR_DIR = DATA / "characters"

# 캐릭터별로 호출할 엔드포인트 (키 이름 -> API 경로)
ENDPOINTS = {
    "basic": "character/basic",
    "stat": "character/stat",
    "ability": "character/ability",
    "hexamatrix": "character/hexamatrix",
    "hexamatrix_stat": "character/hexamatrix-stat",
    "symbol": "character/symbol-equipment",
    "item": "character/item-equipment",
    "set_effect": "character/set-effect",
    "dojang": "character/dojang",
    "union": "user/union",
}

ITEM_KEYS = (
    "item_equipment_part", "item_equipment_slot", "item_name", "item_icon", "starforce",
    "potential_option_grade", "potential_option_1", "potential_option_2", "potential_option_3",
    "additional_potential_option_grade", "additional_potential_option_1",
    "additional_potential_option_2", "additional_potential_option_3", "scroll_upgrade",
)


def fetch_roster(client: Client) -> list[dict]:
    data = client.get("character/list")
    roster = [
        {k: c[k] for k in ("ocid", "character_name", "world_name", "character_class", "character_level")}
        for acc in data.get("account_list", []) for c in acc.get("character_list", [])
    ]
    roster.sort(key=lambda c: -c["character_level"])
    return roster


def pick_targets(roster: list[dict], cfg: dict) -> list[dict]:
    names = cfg.get("names") or []
    if names:
        by_name = {c["character_name"]: c for c in roster}
        missing = [n for n in names if n not in by_name]
        if missing:
            print(f"[characters] 계정에서 찾을 수 없는 캐릭터: {missing}")
        return [by_name[n] for n in names if n in by_name]
    return roster[: int(cfg.get("auto_top", 3))]


def stat_map(stat: dict) -> dict:
    return {s["stat_name"]: s["stat_value"] for s in stat.get("final_stat", [])}


def slim(raw: dict) -> dict:
    """페이지 표시/분석에 필요한 부분만 남겨 저장 용량을 줄입니다."""
    out = dict(raw)
    if "item" in raw:
        out["item"] = [{k: it.get(k) for k in ITEM_KEYS} for it in raw["item"].get("item_equipment", [])]
    if "symbol" in raw:
        out["symbol"] = [{k: s.get(k) for k in (
            "symbol_name", "symbol_icon", "symbol_level", "symbol_force",
            "symbol_growth_count", "symbol_require_growth_count")} for s in raw["symbol"].get("symbol", [])]
    if "stat" in raw:
        out["stat"] = stat_map(raw["stat"])
    if "hexamatrix" in raw:
        out["hexamatrix"] = [{k: h.get(k) for k in ("hexa_core_name", "hexa_core_type", "hexa_core_level")}
                             for h in raw["hexamatrix"].get("character_hexa_core_equipment") or []]
    if "set_effect" in raw:
        out["set_effect"] = [{"name": s.get("set_name"), "count": s.get("total_set_count")}
                             for s in raw["set_effect"].get("set_effect", [])]
    if "ability" in raw:
        out["ability"] = {"grade": raw["ability"].get("ability_grade"),
                          "lines": [a["ability_value"] for a in raw["ability"].get("ability_info", [])]}
    return out


def to_int(v, default=0):
    try:
        return int(float(str(v).replace(",", "")))
    except (TypeError, ValueError):
        return default


def snapshot(c: dict, today: str) -> dict:
    b, st = c.get("basic", {}), c.get("stat", {})
    return {
        "date": today,
        "level": b.get("character_level"),
        "exp": b.get("character_exp"),
        "exp_rate": float(b.get("character_exp_rate") or 0),
        "combat_power": to_int(st.get("전투력")),
        "arcane_force": to_int(st.get("아케인포스")),
        "authentic_force": to_int(st.get("어센틱포스")),
        "union_level": (c.get("union") or {}).get("union_level"),
        "dojang_floor": (c.get("dojang") or {}).get("dojang_best_floor"),
    }


def collect(client: Client, cfg: dict, roster_enabled: bool = True) -> dict:
    now = now_kst()
    today = now.date().isoformat()
    roster = fetch_roster(client)
    targets = pick_targets(roster, cfg)
    results = []
    for t in targets:
        name = t["character_name"]
        raw, errors = {}, []
        for key, path in ENDPOINTS.items():
            try:
                raw[key] = client.get(path, ocid=t["ocid"])
            except NexonError as err:
                errors.append(f"{key}: {err}")
        if "basic" not in raw:
            print(f"[characters] {name} 기본 정보 조회 실패, 건너뜀: {errors}")
            continue
        c = slim(raw)
        c["collected_at"] = now.isoformat()
        c["errors"] = errors
        folder = CHAR_DIR / safe_name(name)
        write_json(folder / "latest.json", c)

        history = read_json(folder / "history.json", [])
        history = [h for h in history if h["date"] != today] + [snapshot(c, today)]
        history.sort(key=lambda h: h["date"])
        write_json(folder / "history.json", history)
        c["history"] = history
        results.append(c)
        print(f"[characters] {name} Lv.{c['basic'].get('character_level')} 저장 (오류 {len(errors)}건)")

    public_roster = [{k: v for k, v in r.items() if k != "ocid"} for r in roster] if roster_enabled else []
    write_json(CHAR_DIR / "roster.json", {"collected_at": now.isoformat(), "characters": public_roster})
    return {"characters": results, "roster": public_roster}
