"""스타포스 / 큐브 / 메소 잠재능력 재설정 사용 기록 수집 → 날짜별 집계.

저장소가 공개일 수 있으므로 원본 기록(아이템 이름, 시각, 기록 ID)은 저장하지 않고,
'성급·스타캐치·파괴방지별 결과 수', '재설정 종류·등급별 시도/등급 상승 수' 같은 집계만 저장합니다.

저장: data/history/YYYY-MM.json  {"YYYY-MM-DD": {"starforce": {키: 결과수}, "potential": {키: 집계}}}
상태: data/history/state.json    {"oldest": 가장 과거로 채운 날짜, "complete": 더 과거 데이터 없음}
"""
from __future__ import annotations

from datetime import date, timedelta

from .nexon import Client, NexonError
from .util import DATA, now_kst, read_json, write_json

HIST_DIR = DATA / "history"
STATE = HIST_DIR / "state.json"
FIRST_DAY = date(2023, 12, 27)  # 넥슨 Open API 기록 조회 가능 시작일
RECENT_DAYS = 3                  # 늦게 반영되는 기록이 있어 최근 며칠은 매번 다시 집계

ENDPOINTS = {"starforce": "history/starforce", "cube": "history/cube", "potential": "history/potential"}

GRADES = {"레어": "rare", "에픽": "epic", "유니크": "unique", "레전드리": "legendary"}


# ---------- 원본 기록 하나 → 집계 키 ----------

def sf_outcome(result: str) -> str:
    r = result or ""
    if "파괴" in r:
        return "destroy"
    if "하락" in r:
        return "down"
    if "성공" in r:
        return "success"
    return "keep"


def flag(v) -> bool:
    """API 플래그: True/False, "1"/"0", "적용"/"미적용"/"해당 없음" 등 어떤 형태든 참/거짓으로"""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    s = str(v or "").strip()
    # 실제 응답 예: "슈페리얼 장비 미해당", "찬스타임 미적용", "이벤트 적용되지 않음", "파괴 방지 미적용"
    negatives = ("미적용", "미해당", "않음", "아님", "없음", "해당 없음", "해당없음")
    return bool(s) and s.lower() not in ("0", "false", "n", "none") and not any(w in s for w in negatives)


def sf_key(rec: dict) -> str | None:
    """'성급|스타캐치|파괴방지|특수' (특수: none/event/chance/superior/item/eventmap). 성급을 모르면 None
    스타캐치: success/fail, API가 값을 주지 않으면(null) none"""
    before = rec.get("before_starforce_count")
    if before is None:
        return None
    catch = str(rec.get("starcatch_result") or "")
    catch = "success" if "성공" in catch else "fail" if "실패" in catch else "none"
    guard = "guard" if flag(rec.get("destroy_defence")) else "noguard"
    if flag(rec.get("superior_item_flag")):
        special = "superior"
    elif flag(rec.get("chance_time")):
        special = "chance"
    elif str(rec.get("upgrade_item") or "").strip():
        special = "item"      # 강화권·펄스 인핸서 등 메소 강화가 아닌 경우
    elif flag(rec.get("event_field_flag")):
        special = "eventmap"  # 파괴 방지 이벤트맵
    elif rec.get("starforce_event_list"):
        special = "event"
    else:
        special = "none"
    return f"{int(before)}|{catch}|{guard}|{special}"


def _first_grade(options) -> str | None:
    for o in options or []:
        g = GRADES.get((o or {}).get("grade"))
        if g:
            return g
    return None


def pot_key(rec: dict, source: str) -> tuple[str, str] | None:
    """(키, 종류) — 키 '종류|이름|이전등급|normal/miracle', 종류 main/additional"""
    name = rec.get("cube_type") if source == "cube" else rec.get("potential_type")
    name = name or ("메소 잠재능력 재설정" if source == "potential" else "알 수 없는 큐브")
    kind = "additional" if "에디셔널" in name else "main"
    if kind == "main":
        grade = _first_grade(rec.get("before_potential_option")) or GRADES.get(rec.get("potential_option_grade"))
    else:
        grade = _first_grade(rec.get("before_additional_potential_option")) or GRADES.get(rec.get("additional_potential_option_grade"))
    if not grade:
        return None
    time = "miracle" if flag(rec.get("miracle_time_flag")) else "normal"  # 미라클 타임은 등급 상승 확률이 달라 따로 집계
    return f"{kind}|{name}|{grade}|{time}", kind


def aggregate(day_records: dict[str, list[dict]]) -> dict:
    """{starforce: [...], cube: [...], potential: [...]} → 하루 집계"""
    out = {"starforce": {}, "potential": {}}
    for rec in day_records.get("starforce", []):
        key = sf_key(rec)
        if key is None:
            continue
        c = out["starforce"].setdefault(key, {"success": 0, "keep": 0, "down": 0, "destroy": 0})
        c[sf_outcome(rec.get("item_upgrade_result"))] += 1
    for source in ("cube", "potential"):
        for rec in day_records.get(source, []):
            k = pot_key(rec, source)
            if k is None:
                continue
            key, _ = k
            c = out["potential"].setdefault(key, {"n": 0, "up": 0, "guaranteed": 0, "levels": {}})
            c["n"] += 1
            upgraded = "성공" in (rec.get("item_upgrade_result") or "")
            if upgraded and flag(rec.get("upgrade_guarantee")):
                c["guaranteed"] += 1
            elif upgraded:
                c["up"] += 1
            lv = rec.get("item_level")
            if lv:
                c["levels"][str(lv)] = c["levels"].get(str(lv), 0) + 1  # 메소 비용 계산용 (장비 레벨별 횟수)
    return out


# ---------- API ----------

def _records(resp: dict, source: str) -> list[dict]:
    for key in (f"{source}_history", "history"):
        if isinstance(resp.get(key), list):
            return resp[key]
    lists = [v for v in resp.values() if isinstance(v, list)]
    return lists[0] if lists else []


# 실제 응답 형식 점검용: 플래그 필드에 들어오는 값의 종류와 개수만 로그로 출력 (이름·시각 등은 출력하지 않음)
VOCAB_FIELDS = {
    "starforce": ["item_upgrade_result", "starcatch_result", "superior_item_flag", "destroy_defence", "chance_time",
                  "event_field_flag", "upgrade_item", "protect_shield", "bonus_stat_upgrade"],
    "cube": ["cube_type", "item_upgrade_result", "miracle_time_flag", "upgrade_guarantee", "potential_option_grade",
             "additional_potential_option_grade"],
    "potential": ["potential_type", "item_upgrade_result", "miracle_time_flag", "upgrade_guarantee", "potential_option_grade",
                  "additional_potential_option_grade"],
}
VOCAB: dict = {}


def note_vocab(source: str, recs: list[dict]) -> None:
    v = VOCAB.setdefault(source, {"_fields": set()})
    for r in recs:
        v["_fields"].update(r.keys())
        for f in VOCAB_FIELDS.get(source, []):
            val = r.get(f)
            val = repr(val)[:40] if not isinstance(val, str) else val[:40]
            v.setdefault(f, {}).setdefault(val, 0)
            v[f][val] += 1
        if source == "starforce":
            ev = "있음" if r.get("starforce_event_list") else "없음"
            v.setdefault("starforce_event_list", {}).setdefault(ev, 0)
            v["starforce_event_list"][ev] += 1


def print_vocab() -> None:
    import json
    for source, v in VOCAB.items():
        out = {k: (sorted(x) if isinstance(x, set) else x) for k, x in v.items()}
        print(f"[history-vocab] {source} {json.dumps(out, ensure_ascii=False)}")


def fetch_day(client: Client, day: date) -> dict[str, list[dict]]:
    out = {}
    for source, path in ENDPOINTS.items():
        recs, resp = [], client.get(path, count=1000, date=day.isoformat())
        recs += _records(resp, source)
        guard = 0
        while resp.get("next_cursor") and guard < 50:
            resp = client.get(path, count=1000, cursor=resp["next_cursor"])
            recs += _records(resp, source)
            guard += 1
        out[source] = recs
        note_vocab(source, recs)
    return out


def save_day(day: date, agg: dict) -> None:
    f = HIST_DIR / f"{day:%Y-%m}.json"
    month = read_json(f, {})
    if agg["starforce"] or agg["potential"]:
        month[day.isoformat()] = agg
    else:
        month.pop(day.isoformat(), None)
    write_json(f, dict(sorted(month.items())))


def collect(client: Client, cfg: dict) -> dict:
    if not cfg.get("enabled", True):
        return {}
    per_run = int(cfg.get("backfill_days_per_run", 45))
    yesterday = now_kst().date() - timedelta(days=1)
    state = read_json(STATE, {})
    oldest = date.fromisoformat(state["oldest"]) if state.get("oldest") else None

    days = [yesterday - timedelta(days=i) for i in range(RECENT_DAYS)]
    if not state.get("complete"):
        start = (oldest or yesterday - timedelta(days=RECENT_DAYS - 1)) - timedelta(days=1)
        days += [start - timedelta(days=i) for i in range(per_run) if start - timedelta(days=i) >= FIRST_DAY]

    done, errors = 0, 0
    for day in days:
        try:
            agg = aggregate(fetch_day(client, day))
        except NexonError as err:
            errors += 1
            print(f"[history] {day} 조회 실패: {err}")
            if errors >= 3:
                print("[history] 실패가 반복되어 이번 실행은 중단합니다")
                break
            continue
        save_day(day, agg)
        done += 1
        if oldest is None or day < oldest:
            oldest = day
    if oldest:
        state["oldest"] = oldest.isoformat()
        state["complete"] = oldest <= FIRST_DAY
    state["updated"] = now_kst().isoformat(timespec="minutes")
    write_json(STATE, state)
    print_vocab()
    print(f"[history] {done}일 집계 (가장 과거 {state.get('oldest')}, 전체 완료 {state.get('complete')})")
    return state


def load_all() -> dict:
    """사이트용: 모든 월 파일 합치기"""
    out = {}
    for f in sorted(HIST_DIR.glob("20*.json")):
        out.update(read_json(f, {}))
    return out
