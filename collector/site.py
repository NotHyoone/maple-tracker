"""정적 페이지 빌드: web/ 을 site/ 로 복사하고, 화면에 필요한 데이터를 site/data/app.json 으로 씁니다.

화면은 브라우저에서 JavaScript(web/js/)가 그립니다.
"""
from __future__ import annotations

import json
import shutil

from .history import load_all as history_all
from .util import DATA, ROOT, now_kst, read_json

WEB = ROOT / "web"
SITE = ROOT / "site"


def build(title: str, events: list[dict], updates: list[dict], characters: list[dict],
          roster: list[dict], guides: dict, collected_at: str | None = None) -> None:
    if SITE.exists():
        shutil.rmtree(SITE)
    shutil.copytree(WEB, SITE)
    payload = {
        "title": title,
        # 페이지에 보이는 '마지막 수집' 시각. --site-only 재빌드 때도 실제 수집 시각을 유지
        "generated_at": (collected_at or now_kst().isoformat())[:16],
        "events": events,
        "updates": updates,
        "roster": roster,
        "characters": characters,
        "guides": guides,
        "observed_exp": read_json(DATA / "observed_exp.json", {}),
        "history": history_all(),
        "history_state": read_json(DATA / "history" / "state.json", {}),
    }
    out = SITE / "data" / "app.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[site] {SITE} 생성 (data/app.json {out.stat().st_size // 1024}KB)")
