"""실행: python -m collector.main  (환경변수 NEXON_API_KEY 필요)

  --site-only   : API 호출 없이 data/ 의 기존 데이터로 페이지만 다시 생성
  --notify-test : 디스코드 웹훅 연결 확인용 테스트 메시지 전송 (--site-only 와 함께 사용)
"""
from __future__ import annotations

import sys
import tomllib

from . import characters, events, growth, history, notify, site
from .nexon import Client, NexonError
from .util import DATA, ROOT, read_json, safe_name, write_json


def load_config() -> dict:
    with open(ROOT / "config.toml", "rb") as f:
        return tomllib.load(f)


def load_saved() -> tuple[list, list, list, list]:
    ev = read_json(DATA / "events" / "current.json", {}).get("events", [])
    upd = read_json(DATA / "events" / "updates.json", [])
    roster = read_json(DATA / "characters" / "roster.json", {}).get("characters", [])
    chars = []
    for d in sorted((DATA / "characters").glob("*/latest.json")):
        c = read_json(d)
        c["history"] = read_json(d.parent / "history.json", [])
        chars.append(c)
    return ev, upd, chars, roster


def main(argv: list[str]) -> int:
    cfg = load_config()
    saved = load_saved()
    ev, upd, chars, roster = saved
    if "--site-only" not in argv:
        client = Client()
        # 각 단계가 실패해도(호출 한도 초과 등) 이전에 저장한 데이터로 페이지를 만들어 배포는 계속합니다
        try:
            e = events.collect(client)
            ev, upd = e["events"], e["updates"]
        except NexonError as err:
            print(f"[events] 수집 실패, 저장된 이벤트 사용: {err}")
        try:
            ch = characters.collect(client, cfg.get("characters", {}), cfg.get("roster", {}).get("enabled", True))
            chars, roster = ch["characters"], ch["roster"]
        except NexonError as err:
            print(f"[characters] 수집 실패, 저장된 캐릭터 정보 사용: {err}")
        if not client.quota_exceeded:
            try:
                history.collect(client, cfg.get("history", {}))
            except Exception as err:  # noqa: BLE001 - 기록 수집 실패가 다른 수집을 막지 않도록
                print(f"[history] 수집 중단: {err}")
        print(f"[main] API 호출 {client.calls}회{' (호출 한도 초과로 일부 수집 생략)' if client.quota_exceeded else ''}")

    # config 순서대로 정렬
    order = {n: i for i, n in enumerate(cfg.get("characters", {}).get("names") or [])}
    chars.sort(key=lambda c: order.get(c["basic"]["character_name"], 99))

    guides = growth.build_guide(ev, chars, roster)
    write_json(DATA / "guide.json", {safe_name(k): v for k, v in guides.items()})
    collected_at = read_json(DATA / "events" / "current.json", {}).get("collected_at")
    site.build(cfg.get("site", {}).get("title", "메이플 트래커"), ev, upd, chars, roster, guides, collected_at)
    if "--notify-test" in argv:
        notify.send_test(ev, guides, cfg.get("site", {}).get("url"))
    elif "--site-only" not in argv:
        try:
            notify.notify(ev, guides, cfg.get("notify", {}), cfg.get("site", {}).get("url"))
        except Exception as err:  # noqa: BLE001 - 알림 실패가 수집·배포를 막지 않도록
            print(f"[notify] 알림 중단: {err}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
