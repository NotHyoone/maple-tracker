"""이벤트 / 업데이트 공지 수집."""
from __future__ import annotations

import html
import re

from .nexon import Client, NexonError, NexonQuotaError
from .util import DATA, now_kst, parse_dt, read_json, write_json

EVENT_DIR = DATA / "events"
DETAIL_DIR = EVENT_DIR / "details"


def html_to_text(contents: str) -> str:
    """이벤트 상세 HTML에서 읽을 수 있는 텍스트만 뽑습니다.
    본문 대부분이 이미지지만, 검색용 숨김 텍스트(b_srch)와 alt 텍스트가 들어 있습니다."""
    if not contents:
        return ""
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", contents, flags=re.S | re.I)
    alts = re.findall(r'alt="([^"]+)"', s)
    s = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</tr>|</h\d>", "\n", s, flags=re.I)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    lines, seen = [], set()
    for raw in alts + s.splitlines():
        line = re.sub(r"\s+", " ", raw).strip()
        if line and line not in seen:
            seen.add(line)
            lines.append(line)
    return "\n".join(lines)


def collect(client: Client) -> dict:
    now = now_kst()
    listing = client.get("notice-event").get("event_notice", [])
    events = []
    for e in listing:
        nid = e["notice_id"]
        cache = DETAIL_DIR / f"{nid}.json"
        detail = read_json(cache)
        # 공지는 수정될 수 있으므로 게시일(date)이 바뀌면 다시 받습니다.
        if not detail or detail.get("date") != e.get("date"):
            try:
                d = client.get("notice-event/detail", notice_id=nid)
                detail = {
                    "notice_id": nid,
                    "title": d.get("title") or e["title"],
                    "url": d.get("url") or e["url"],
                    "date": e.get("date"),
                    "text": html_to_text(d.get("contents", "")),
                }
                write_json(cache, detail)
            except NexonQuotaError:
                raise
            except NexonError as err:
                print(f"[events] 상세 조회 실패 {nid}: {err}")
                detail = {"text": ""}
        events.append({
            "notice_id": nid,
            "title": e["title"],
            "url": e["url"],
            "thumbnail_url": e.get("thumbnail_url"),
            "date": e.get("date"),
            "date_event_start": e.get("date_event_start"),
            "date_event_end": e.get("date_event_end"),
            "text": detail.get("text", ""),
        })

    # 진행 중 / 예정 이벤트만 '현재'로 취급
    def active(ev):
        end = parse_dt(ev["date_event_end"])
        return end is None or end >= now

    current = [ev for ev in events if active(ev)]
    current.sort(key=lambda ev: ev["date_event_end"] or "9999")

    # 업데이트 공지(패치노트)는 제목만
    try:
        updates = client.get("notice-update").get("update_notice", [])[:10]
    except NexonQuotaError:
        raise
    except NexonError as err:
        print(f"[events] 업데이트 공지 조회 실패: {err}")
        updates = read_json(EVENT_DIR / "updates.json", [])

    write_json(EVENT_DIR / "current.json", {"collected_at": now.isoformat(), "events": current})
    write_json(EVENT_DIR / "updates.json", updates)

    # 지금까지 본 모든 이벤트 기록 (본문 제외)
    archive = {str(a["notice_id"]): a for a in read_json(EVENT_DIR / "archive.json", [])}
    for ev in events:
        archive[str(ev["notice_id"])] = {k: ev[k] for k in (
            "notice_id", "title", "url", "date", "date_event_start", "date_event_end")}
    write_json(EVENT_DIR / "archive.json",
               sorted(archive.values(), key=lambda a: a["notice_id"], reverse=True))
    print(f"[events] 진행 중 {len(current)}개, 누적 {len(archive)}개")
    return {"events": current, "updates": updates}
