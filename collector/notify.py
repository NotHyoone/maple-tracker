"""디스코드 알림: 종료 임박 이벤트(기본 3일·1일 전)와 새로 시작한 이벤트.

웹훅 주소는 환경변수 DISCORD_WEBHOOK_URL (GitHub Secret)로 받습니다. 없으면 알림만 건너뜁니다.
보낸 기록은 data/notify_state.json 에 남겨 같은 알림을 두 번 보내지 않습니다.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from .util import DATA, now_kst, parse_dt, read_json, write_json

STATE = DATA / "notify_state.json"
MAX_EMBEDS = 10  # 디스코드 메시지당 임베드 최대 개수
COLOR_ENDING, COLOR_NEW = 0xD64545, 0x3B6FD8


def _kst(s: str | None) -> str:
    d = parse_dt(s)
    return d.strftime("%m.%d %H:%M") if d else "-"


def recommendations_for(notice_id, guides: dict, min_score: int = 3) -> list[str]:
    """이 이벤트가 성장에 도움이 되는 캐릭터: '이름: 분야 ★N'"""
    out = []
    for name, g in guides.items():
        for r in g.get("recommendations", []):
            if r["notice_id"] == notice_id and r["score"] >= min_score:
                out.append(f"{name}: {r['category']} {'★' * min(r['score'], 5)}")
    return out


def build_embed(ev: dict, kind: str, days_left: float | None, guides: dict) -> dict:
    if kind == "new":
        title_prefix, color = "🆕 새 이벤트", COLOR_NEW
    else:
        left = "오늘 종료" if days_left is not None and days_left < 1 else f"D-{int(days_left)}"
        title_prefix, color = f"⏰ {left}", COLOR_ENDING
    fields = [{"name": "기간", "value": f"{_kst(ev.get('date_event_start'))} ~ {_kst(ev.get('date_event_end'))}", "inline": False}]
    recs = recommendations_for(ev["notice_id"], guides)
    if recs:
        fields.append({"name": "챙기면 좋은 캐릭터", "value": "\n".join(recs)[:1000], "inline": False})
    if ev.get("highlights"):
        fields.append({"name": "주요 보상", "value": " · ".join(ev["highlights"])[:1000], "inline": False})
    embed = {"title": f"{title_prefix} | {ev['title']}"[:250], "url": ev.get("url"), "color": color, "fields": fields}
    if ev.get("thumbnail_url"):
        embed["thumbnail"] = {"url": ev["thumbnail_url"]}
    return embed


def plan(events: list[dict], state: dict, cfg: dict, now=None) -> tuple[list[tuple[dict, str, float | None, str]], dict]:
    """보낼 알림 목록 [(이벤트, 종류, 남은 일수, 상태 키)]과 새 상태. 실제 전송은 하지 않음"""
    now = now or now_kst()
    thresholds = sorted({float(d) for d in cfg.get("ending_days", [3, 1])}, reverse=True)
    sent = dict(state.get("sent", {}))
    first_run = "sent" not in state
    todo = []
    for ev in events:
        nid = str(ev["notice_id"])
        start, end = parse_dt(ev.get("date_event_start")), parse_dt(ev.get("date_event_end"))
        keys = set(sent.get(nid, []))
        # 새 이벤트: 처음 실행 때는 이미 진행 중인 것을 '본 것'으로만 기록
        if "new" not in keys:
            if cfg.get("new_events", True) and not first_run and (start is None or start <= now):
                todo.append((ev, "new", None, "new"))
            keys.add("new")
        if end and (start is None or start <= now):
            left = (end - now).total_seconds() / 86400
            due = [d for d in thresholds if 0 <= left <= d and f"d{d:g}" not in keys]
            if due:
                # 여러 기준을 한 번에 넘었으면(예: 늦게 켬) 가장 가까운 것 하나만 보내고 나머지도 보낸 것으로 기록
                for d in due:
                    keys.add(f"d{d:g}")
                todo.append((ev, "ending", left, f"d{min(due):g}"))
        sent[nid] = sorted(keys)
    # 끝난 지 오래된 이벤트 기록 정리
    live = {str(e["notice_id"]) for e in events}
    sent = {k: v for k, v in sent.items() if k in live}
    return todo, {"sent": sent, "updated": now.isoformat(timespec="minutes")}


def post(webhook: str, payload: dict) -> None:
    req = urllib.request.Request(webhook, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": "maple-tracker (github actions)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        r.read()


def notify(events: list[dict], guides: dict, cfg: dict, site_url: str | None = None, sender=post) -> int:
    if not cfg.get("discord", True):
        return 0
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    state = read_json(STATE, {})
    todo, new_state = plan(events, state, cfg)
    if not webhook:
        print(f"[notify] DISCORD_WEBHOOK_URL이 없어 알림을 건너뜁니다 (보낼 알림 {len(todo)}건)")
        return 0  # 웹훅이 없으면 상태도 저장하지 않아, 나중에 등록하면 그때 알림이 갑니다
    # 종료 임박을 먼저, 그다음 새 이벤트
    todo.sort(key=lambda t: (t[1] != "ending", t[2] if t[2] is not None else 99))
    sent_count = 0
    for i in range(0, len(todo), MAX_EMBEDS):
        chunk = todo[i:i + MAX_EMBEDS]
        content = cfg.get("mention", "") or ""
        if site_url and i == 0:
            content = (content + f" 메이플 트래커: {site_url}").strip()
        payload = {"username": "메이플 트래커", "content": content or None,
                   "embeds": [build_embed(ev, kind, left, guides) for ev, kind, left, _ in chunk],
                   "allowed_mentions": {"parse": ["everyone", "roles"] if cfg.get("mention") else []}}
        try:
            sender(webhook, payload)
            sent_count += len(chunk)
        except (urllib.error.URLError, TimeoutError) as err:
            # 실패한 것은 다음 실행 때 다시 보내도록 상태에서 되돌림
            print(f"[notify] 디스코드 전송 실패: {err}")
            old_sent = state.get("sent", {})
            for ev, kind, _, _ in todo[i:]:
                nid = str(ev["notice_id"])
                if nid in old_sent:
                    new_state["sent"][nid] = old_sent[nid]
                elif kind == "new":
                    new_state["sent"].pop(nid, None)
                else:
                    new_state["sent"][nid] = ["new"]  # 종료 알림만 다시 보내고, 새 이벤트 알림은 중복으로 보내지 않음
            break
    write_json(STATE, new_state)
    print(f"[notify] 디스코드 알림 {sent_count}건 전송")
    return sent_count
