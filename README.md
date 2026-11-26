# 메이플 트래커

넥슨 Open API로 **이벤트 정보**와 **내 캐릭터 정보**를 하루 3번 자동 수집해서,
게임을 켜지 않아도 휴대폰으로 확인할 수 있는 웹페이지(GitHub Pages)를 만듭니다.

- **내 캐릭터**: 레벨·경험치, 전투력 추이, 주요 스탯, HEXA 코어, 심볼, 장비(스타포스·잠재 등급)
- **이벤트로 성장하기**: 진행 중인 이벤트를 분류(경험치, 헥사, 심볼, 강화, 버닝 등)하고,
  캐릭터의 현재 상태(부족한 심볼, 낮은 HEXA 코어, 레벨 구간 등)에 맞춰 우선순위와 이유, 받을 보상을 보여줍니다.
- **이벤트**: 남은 기간(D-day), 곧 끝나는 이벤트, 본문에서 뽑은 주요 보상
- **계정·공지**: 계정 캐릭터 목록, 업데이트 공지

## 동작 방식

```
GitHub Actions (매일 08:17 / 14:17 / 22:17 KST)
  └ python -m collector.main
      ├ 이벤트 목록·상세 → data/events/
      ├ 캐릭터 정보 → data/characters/<이름>/latest.json, history.json (일별 기록)
      ├ 성장 가이드 → data/guide.json
      └ web/ + data/app.json → site/ → GitHub Pages 배포
```

- `collector/`: 수집·분석 (Python 3.11+, 표준 라이브러리만)
- `web/`: 화면. 브라우저가 `data/app.json`을 읽어 그립니다 (빌드 도구 없는 바닐라 JS)
  - `js/format.js` 포맷·날짜 계산, `js/store.js` 브라우저 저장소, `js/render.js` 화면 조각, `js/app.js` 진입점
- `tests/`: 화면 로직 테스트 — `node --test tests/*.test.mjs`

목표·시세 같은 개인 설정은 **브라우저에만 저장**되고 저장소에는 올라가지 않습니다.
기기를 옮길 때는 `계정·설정` 탭의 백업 내보내기/가져오기를 쓰세요.

## 설정

1. **API 키 등록**: 저장소 `Settings → Secrets and variables → Actions → New repository secret`
   - Name: `NEXON_API_KEY`
   - Secret: 넥슨 Open API 키
2. **Pages**: `Settings → Pages → Source: GitHub Actions`
3. **수집할 캐릭터**: `config.toml` 의 `names` 수정 (비우면 레벨 상위 `auto_top`명 자동)
4. 첫 실행: `Actions → 메이플 정보 수집 → Run workflow`

## 로컬 실행

```bash
export NEXON_API_KEY=발급받은키
python -m collector.main            # 수집 + 페이지 생성
python -m collector.main --site-only  # 저장된 데이터로 페이지만 다시 생성
python -m http.server -d site       # http://localhost:8000 에서 확인 (파일 직접 열기는 안 됨)
```

## 성장 가이드 규칙 바꾸기

`collector/growth.py`
- `CATEGORIES`: 이벤트 분류 키워드. 새 이벤트 유형이 잘못 분류되면 키워드를 추가하세요.
- `reasons_for()`: 분류별로 캐릭터에게 얼마나 중요한지(점수 0~5)와 이유.

## 참고

- 개발 단계 API 키는 하루 호출 수 제한이 있습니다. 한 번 실행에 약 45회 호출하며, 이벤트 상세는 캐시해서 바뀐 것만 다시 받습니다.
- 데이터 출처: NEXON Open API
