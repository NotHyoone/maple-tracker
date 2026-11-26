"""이벤트 분류 + 캐릭터 상태 분석 → 캐릭터별 '이벤트로 성장하는 방법' 추천.

규칙 기반입니다. 새로운 종류의 이벤트가 나오면 CATEGORIES 의 키워드를 추가하세요.
"""
from __future__ import annotations

from datetime import date

from .util import now_kst, parse_dt

# (id, 표시 이름, 키워드)
CATEGORIES = [
    ("exp", "경험치/레벨업", ["경험치", "EXP", "레벨 업", "레벨업", "성장의 비약", "익스트림 성장", "VIP 사우나", "사우나", "몬스터파크", "몬스터 파크"]),
    ("burning", "버닝/신규 육성", ["버닝", "하이퍼 버닝", "부스터", "점핑", "신규 캐릭터"]),
    ("hexa", "헥사/6차 전직", ["솔 에르다", "헥사", "HEXA", "에르다"]),
    ("symbol", "심볼", ["심볼", "아케인", "어센틱", "그랜드 어센틱"]),
    ("enhance", "장비 강화", ["스타포스", "스타 포스", "큐브", "잠재능력", "에디셔널", "강화", "놀라운 장비강화", "주문서", "샤이닝 스타포스"]),
    ("meso", "메소/재화", ["메소", "솔 에르다 조각", "코인", "포인트", "크레딧"]),
    ("boss", "보스", ["보스", "결정석", "격파"]),
    ("union", "유니온/챔피언", ["유니온", "챔피언", "아티팩트", "레이드"]),
    ("daily", "출석/접속 보상", ["출석", "접속", "매일", "일일", "PC방"]),
    ("cash", "코디/캐시/한정판", ["의자", "코디", "헤어", "성형", "라이딩", "캐시", "데미지 스킨", "칭호", "펫", "현대카드", "이모티콘", "가구"]),
]

CATEGORY_NAMES = {cid: name for cid, name, _ in CATEGORIES}
MAX_SYMBOL = {"아케인심볼": 20, "어센틱심볼": 11, "그랜드 어센틱심볼": 11}
HEXA_MAX = 30


def classify(event: dict) -> list[str]:
    title = event.get("title", "")
    text = event.get("text", "")
    scores = []
    for cid, _, words in CATEGORIES:
        # 제목에 나오면 가중치 3, 본문에 나오면 등장 횟수만큼(최대 3)
        s = sum(3 for w in words if w in title)
        s += min(3, sum(text.count(w) for w in words))
        if s:
            scores.append((s, cid))
    scores.sort(reverse=True)
    return [cid for _, cid in scores[:3]]


def highlights(event: dict, cats: list[str], limit: int = 4, max_len: int = 90) -> list[str]:
    """본문에서 분류 키워드가 들어간 줄 몇 개를 요약으로 뽑습니다."""
    words = [w for cid, _, ws in CATEGORIES if cid in cats for w in ws]
    out = []
    for line in event.get("text", "").splitlines():
        if 4 <= len(line) <= max_len and any(w in line for w in words) and line not in out:
            out.append(line)
        if len(out) >= limit:
            break
    return out


def days_left(event: dict, now) -> float | None:
    end = parse_dt(event.get("date_event_end"))
    return None if end is None else (end - now).total_seconds() / 86400


def analyze_character(c: dict) -> dict:
    """캐릭터의 성장 상태(무엇이 부족한지)를 정리합니다."""
    b = c.get("basic", {})
    level = b.get("character_level") or 0
    hist = c.get("history", [])

    # 최근 기록으로 하루 평균 경험치 증가(%) 추정
    exp_per_day = None
    if len(hist) >= 2:
        recent = hist[-8:]
        gained = 0.0
        for prev, cur in zip(recent, recent[1:]):
            if cur["level"] == prev["level"]:
                gained += cur["exp_rate"] - prev["exp_rate"]
            elif cur["level"] and prev["level"]:
                gained += (100 - prev["exp_rate"]) + cur["exp_rate"] + 100 * (cur["level"] - prev["level"] - 1)
        span = (date.fromisoformat(recent[-1]["date"]) - date.fromisoformat(recent[0]["date"])).days
        if span > 0:
            exp_per_day = gained / span

    symbols = c.get("symbol", [])
    symbol_todo = []
    for s in symbols:
        kind = s["symbol_name"].split(" : ")[0].strip()
        mx = MAX_SYMBOL.get(kind)
        if mx and s["symbol_level"] < mx:
            symbol_todo.append({"name": s["symbol_name"], "level": s["symbol_level"], "max": mx})

    hexa = c.get("hexamatrix", [])
    hexa_levels = [h["hexa_core_level"] for h in hexa]
    hexa_avg = sum(hexa_levels) / len(hexa_levels) if hexa_levels else 0
    low_cores = sorted(hexa, key=lambda h: h["hexa_core_level"])[:3]

    items = c.get("item", [])
    # 스타포스 강화가 가능한(1성 이상) 장비만 평균
    sf = [int(i["starforce"]) for i in items if str(i.get("starforce") or "").isdigit() and int(i["starforce"]) > 0]
    sf_avg = sum(sf) / len(sf) if sf else 0

    return {
        "level": level,
        "exp_rate": float(b.get("character_exp_rate") or 0),
        "exp_per_day": exp_per_day,
        "days_to_next": (100 - float(b.get("character_exp_rate") or 0)) / exp_per_day
        if exp_per_day and exp_per_day > 0 else None,
        "symbol_todo": symbol_todo,
        "hexa_avg": hexa_avg,
        "hexa_count": len(hexa),
        "low_cores": low_cores,
        "starforce_avg": sf_avg,
        "union_level": (c.get("union") or {}).get("union_level"),
    }


def reasons_for(cat: str, a: dict, roster: list[dict]) -> tuple[int, str] | None:
    """카테고리가 이 캐릭터에게 얼마나 중요한지(점수)와 이유."""
    lv = a["level"]
    if cat == "exp":
        if lv >= 300:
            return None
        msg = f"Lv.{lv} ({a['exp_rate']:.1f}%)"
        if a["days_to_next"]:
            msg += f" — 지금 속도면 다음 레벨까지 약 {a['days_to_next']:.0f}일"
        return (5 if lv >= 260 else 4), msg + ". 경험치 이벤트를 챙기면 레벨업이 빨라집니다."
    if cat == "burning":
        low = [r for r in roster if r["character_level"] < 260]
        if lv < 260:
            return 5, f"Lv.{lv}로 버닝 혜택을 받을 수 있는 구간입니다."
        if low:
            return 2, f"본캐는 해당 없지만, 260 미만 부캐 {len(low)}명을 키울 때 쓰기 좋습니다(유니온·링크 스킬)."
        return None
    if cat == "hexa":
        if lv < 260:
            return 1, "6차 전직(260) 이후에 의미가 커집니다."
        if a["hexa_count"] == 0:
            return 5, "아직 HEXA 코어가 없습니다. 6차 전직 후 솔 에르다를 모으면 성장 폭이 큽니다."
        if a["hexa_avg"] < HEXA_MAX:
            low = ", ".join(f"{h['hexa_core_name']} Lv.{h['hexa_core_level']}" for h in a["low_cores"])
            return 5, f"HEXA 코어 평균 Lv.{a['hexa_avg']:.1f}/30. 낮은 코어: {low}"
        return None
    if cat == "symbol":
        if not a["symbol_todo"]:
            return None
        todo = ", ".join(f"{s['name'].split(' : ')[-1]} {s['level']}/{s['max']}" for s in a["symbol_todo"][:4])
        return 4, f"미완성 심볼 {len(a['symbol_todo'])}개: {todo}"
    if cat == "enhance":
        return 3, f"장착 장비 평균 스타포스 {a['starforce_avg']:.1f}성. 강화 할인·확률 이벤트 때 몰아서 강화하세요."
    if cat == "meso":
        return 2, "메소·재화는 강화와 HEXA 성장에 모두 쓰입니다."
    if cat == "boss":
        return 3, "보스 관련 보상으로 장비·재화를 얻을 수 있습니다."
    if cat == "union":
        return 2, f"유니온 Lv.{a['union_level']}." if a["union_level"] else "유니온 성장 보상."
    if cat == "daily":
        return 2, "접속·출석만으로 받는 보상 — 손이 적게 가니 놓치지 마세요."
    if cat == "cash":
        return 0, "꾸미기/한정 아이템 위주 — 성장과는 큰 관련이 없습니다."
    return None


def build_guide(events: list[dict], characters: list[dict], roster: list[dict]) -> dict:
    now = now_kst()
    for ev in events:
        ev["categories"] = classify(ev)
        ev["category_names"] = [CATEGORY_NAMES[c] for c in ev["categories"]]
        ev["highlights"] = highlights(ev, ev["categories"])
        dl = days_left(ev, now)
        ev["days_left"] = round(dl, 1) if dl is not None else None
        start = parse_dt(ev.get("date_event_start"))
        ev["upcoming"] = bool(start and start > now)

    guides = {}
    for c in characters:
        a = analyze_character(c)
        recs = []
        for ev in events:
            relevant = []
            for cat in ev["categories"]:
                r = reasons_for(cat, a, roster)
                if r and r[0] > 0:
                    relevant.append((r[0], cat, r[1]))
            if not relevant:
                continue
            relevant.sort(key=lambda x: -x[0])
            best = relevant[0]
            score = best[0]
            # 이 캐릭터에게 필요한 분야의 보상 문구
            rewards = highlights(ev, [cat for _, cat, _ in relevant[:2]], limit=4, max_len=40)
            if ev["days_left"] is not None and ev["days_left"] <= 3 and not ev["upcoming"]:
                score += 1  # 곧 끝나는 이벤트 우선
            recs.append({
                "notice_id": ev["notice_id"], "title": ev["title"], "url": ev["url"],
                "score": score, "category": CATEGORY_NAMES[best[1]], "reason": best[2], "rewards": rewards,
                "days_left": ev["days_left"], "upcoming": ev["upcoming"],
            })
        recs.sort(key=lambda r: (-r["score"], r["days_left"] if r["days_left"] is not None else 999))
        guides[c["basic"]["character_name"]] = {"analysis": a, "recommendations": recs}
    return guides
