"""넥슨 Open API (메이플스토리) 최소 클라이언트. 표준 라이브러리만 사용합니다."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "https://open.api.nexon.com/maplestory/v1"
RETRY_STATUS = {429, 500, 502, 503, 504}


class NexonError(Exception):
    pass


class Client:
    def __init__(self, api_key: str | None = None, min_interval: float = 0.25):
        self.api_key = api_key or os.environ.get("NEXON_API_KEY", "").strip()
        if not self.api_key:
            raise SystemExit(
                "NEXON_API_KEY 환경변수가 없습니다. GitHub 저장소의 "
                "Settings > Secrets and variables > Actions 에 등록하세요."
            )
        self.min_interval = min_interval  # 개발용 키는 초당 호출 수가 제한됩니다
        self._last_call = 0.0
        self.calls = 0

    def get(self, path: str, **params) -> dict:
        params = {k: v for k, v in params.items() if v is not None}
        url = f"{BASE_URL}/{path.lstrip('/')}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        headers = {
            "x-nxopen-api-key": self.api_key,
            "accept": "application/json",
            "user-agent": "maple-tracker",
        }
        for attempt in range(4):
            wait = self.min_interval - (time.monotonic() - self._last_call)
            if wait > 0:
                time.sleep(wait)
            self._last_call = time.monotonic()
            self.calls += 1
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return json.load(resp)
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", "replace")
                if e.code in RETRY_STATUS and attempt < 3:
                    time.sleep(1.5 * 2**attempt)
                    continue
                raise NexonError(f"HTTP {e.code} {path}: {body[:300]}") from None
            except (urllib.error.URLError, TimeoutError) as e:
                if attempt < 3:
                    time.sleep(1.5 * 2**attempt)
                    continue
                raise NexonError(f"{path}: {e}") from None
        raise NexonError(f"{path}: retries exhausted")
