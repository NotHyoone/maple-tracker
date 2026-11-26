#!/usr/bin/env bash
# Codex CLI를 ChatGPT 구독 인증으로만 실행하는 래퍼.
# API 키(종량제 과금) 경로를 차단하고, ChatGPT 로그인이 아니면 실행을 거부한다.
#
# 사용법: codex-sub.sh [--write] "<프롬프트>"
#   --write : 작업 폴더 쓰기 허용 (기본은 읽기 전용)
set -euo pipefail

SANDBOX="read-only"
if [[ "${1:-}" == "--write" ]]; then
  SANDBOX="workspace-write"
  shift
fi

if [[ $# -lt 1 ]]; then
  echo "usage: $0 [--write] \"<prompt>\"" >&2
  exit 2
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI가 설치되어 있지 않습니다. (npm i -g @openai/codex)" >&2
  exit 3
fi

# 1) API 키 환경변수를 제거해서 종량제 API 경로로 새지 않게 한다.
unset OPENAI_API_KEY CODEX_API_KEY OPENAI_BASE_URL

# 2) 현재 로그인이 ChatGPT 계정 로그인인지 확인한다.
STATUS="$(codex login status 2>&1 || true)"
if ! grep -qi "chatgpt" <<<"$STATUS"; then
  echo "ERROR: Codex가 ChatGPT 구독으로 로그인되어 있지 않습니다." >&2
  echo "       현재 상태: $STATUS" >&2
  echo "       'codex logout' 후 'codex login'으로 ChatGPT 계정 로그인을 하세요." >&2
  exit 4
fi

# 3) ChatGPT 로그인만 강제하고 비대화식으로 실행한다.
#    stdin을 /dev/null로 막아 추가 입력 대기로 멈추지 않게 한다.
exec codex exec \
  -c 'forced_login_method="chatgpt"' \
  --sandbox "$SANDBOX" \
  --skip-git-repo-check \
  "$*" < /dev/null
