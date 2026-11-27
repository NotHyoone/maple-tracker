"""내 캐릭터 정보 수집 + 일별 기록."""
from __future__ import annotations

from .nexon import Client, NexonError, NexonQuotaError
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
    "hyper_stat": "character/hyper-stat",
}

ITEM_KEYS = (
    "item_equipment_part", "item_equipment_slot", "item_name", "item_icon", "starforce",
    "potential_option_grade", "potential_option_1", "potential_option_2", "potential_option_3",
    "additional_potential_option_grade", "additional_potential_option_1",
    "additional_potential_option_2", "additional_potential_option_3", "scroll_upgrade",
    "starforce_scroll_flag",
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


def slim_items(items: list[dict] | None) -> list[dict]:
    return [
        {**{k: it.get(k) for k in ITEM_KEYS},
         # 스타포스 강화 비용은 아이템 레벨로 정해집니다
         "item_level": (it.get("item_base_option") or {}).get("base_equipment_level")}
        for it in items or []
    ]


def slim(raw: dict) -> dict:
    """페이지 표시/분석에 필요한 부분만 남겨 저장 용량을 줄입니다."""
    out = dict(raw)
    if "item" in raw:
        item = raw["item"] or {}
        out["item"] = slim_items(item.get("item_equipment"))
        out["item_presets"] = [
            slim_items(item.get(f"item_equipment_preset_{i}")) for i in range(1, 4)
        ]
        out["item_preset_no"] = item.get("preset_no")
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
        ability = raw["ability"] or {}
        out["ability"] = {
            "grade": ability.get("ability_grade"),
            "lines": [a["ability_value"] for a in ability.get("ability_info") or []],
            "presets": [
                {"grade": preset.get("ability_preset_grade"),
                 "lines": [a["ability_value"] for a in preset.get("ability_info") or []]}
                if (preset := ability.get(f"ability_preset_{i}")) is not None else None
                for i in range(1, 4)
            ],
            "preset_no": ability.get("preset_no"),
        }
    if "hyper_stat" in raw:
        hyper_stat = raw.get("hyper_stat") or {}
        try:
            preset_no = int(hyper_stat.get("use_preset_no"))
        except (TypeError, ValueError):
            preset_no = None
        out["hyper_stat"] = {
            "preset_no": preset_no,
            "presets": [
                [{k: s.get(k) for k in ("stat_type", "stat_level", "stat_increase")}
                 for s in hyper_stat.get(f"hyper_stat_preset_{i}") or []
                 if to_int(s.get("stat_level")) != 0]
                for i in range(1, 4)
            ],
        }
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


OBSERVED_EXP = DATA / "observed_exp.json"
MAX_EXTRA_PROBES = 8  # 실행당 추가로 조회할 부캐 수 (API 호출 한도 보호)


def observe_exp(observed: dict, basic: dict, today: str) -> None:
    """경험치와 경험치%로 그 레벨의 필요 경험치를 역산해 기록합니다.
    %가 소수점 3자리까지라 %가 높을수록 정확하므로, 같은 레벨이면 %가 더 높은 측정을 남깁니다."""
    lv, exp = basic.get("character_level"), basic.get("character_exp")
    try:
        rate = float(basic.get("character_exp_rate") or 0)
    except ValueError:
        return
    if not lv or exp is None or rate < 1 or lv >= 300:
        return
    key = str(lv)
    if key in observed and observed[key]["rate"] >= rate:
        return
    observed[key] = {"required": round(exp / (rate / 100)), "rate": rate, "date": today,
                     # 경험치%가 0.0005 반올림되어 생기는 최대 상대 오차
                     "max_error": round(0.0005 / rate, 7)}


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
            except NexonQuotaError:
                raise  # 한도 초과면 불완전한 데이터로 덮어쓰지 않도록 전체 중단
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

    # 레벨별 필요 경험치 실측: 상세 수집 캐릭터 + 아직 측정 안 된 레벨의 부캐 몇 명
    observed = read_json(OBSERVED_EXP, {})
    for c in results:
        observe_exp(observed, c["basic"], today)
    tracked = {t["ocid"] for t in targets}
    probes = [r for r in roster if r["ocid"] not in tracked and str(r["character_level"]) not in observed
              and r["character_level"] < 300]
    for r in probes[:MAX_EXTRA_PROBES]:
        try:
            observe_exp(observed, client.get("character/basic", ocid=r["ocid"]), today)
        except NexonQuotaError:
            break
        except NexonError:
            pass
    write_json(OBSERVED_EXP, dict(sorted(observed.items(), key=lambda kv: int(kv[0]))))

    public_roster = [{k: v for k, v in r.items() if k != "ocid"} for r in roster] if roster_enabled else []
    write_json(CHAR_DIR / "roster.json", {"collected_at": now.isoformat(), "characters": public_roster})
    return {"characters": results, "roster": public_roster}
