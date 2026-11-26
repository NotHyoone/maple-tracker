"""실행: python -m collector.main  (환경변수 NEXON_API_KEY 필요)

  --site-only : API 호출 없이 data/ 의 기존 데이터로 페이지만 다시 생성
"""
from __future__ import annotations

import sys
import tomllib

from . import characters, events, growth, history, notify, site
from .nexon import Client
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
    if "--site-only" in argv:
        ev, upd, chars, roster = load_saved()
    else:
        client = Client()
        e = events.collect(client)
        ch = characters.collect(client, cfg.get("characters", {}), cfg.get("roster", {}).get("enabled", True))
        ev, upd, chars, roster = e["events"], e["updates"], ch["characters"], ch["roster"]
        try:
            history.collect(client, cfg.get("history", {}))
        except Exception as err:  # noqa: BLE001 - 기록 수집 실패가 다른 수집을 막지 않도록
            print(f"[history] 수집 중단: {err}")
        print(f"[main] API 호출 {client.calls}회")

    # config 순서대로 정렬
    order = {n: i for i, n in enumerate(cfg.get("characters", {}).get("names") or [])}
    chars.sort(key=lambda c: order.get(c["basic"]["character_name"], 99))

    guides = growth.build_guide(ev, chars, roster)
    write_json(DATA / "guide.json", {safe_name(k): v for k, v in guides.items()})
    collected_at = read_json(DATA / "events" / "current.json", {}).get("collected_at")
    site.build(cfg.get("site", {}).get("title", "메이플 트래커"), ev, upd, chars, roster, guides, collected_at)
    if "--site-only" not in argv:
        try:
            notify.notify(ev, guides, cfg.get("notify", {}), cfg.get("site", {}).get("url"))
        except Exception as err:  # noqa: BLE001 - 알림 실패가 수집·배포를 막지 않도록
            print(f"[notify] 알림 중단: {err}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
