# 화면 이동과 동의 수집 보완 — 2026-11-16

기준 운영 커밋: `9e83c14c59e3e00889e77296e8241ad50ef9f5b4` (v117). 변경 후보: v118.
이 문서는 코드 변경 및 격리 시험 결과를 설명한다. 운영 배포나 GA4/PostHog 서버 수신 완료를 의미하지 않는다.

## 확인한 문제와 변경

| 구간 | 기존 문제 | 변경 후 |
| --- | --- | --- |
| Reader 본문 → 찾기 → 보관함 | 주소가 바뀌지 않는 화면 이동에 page_view가 없었다. | 실제로 다른 화면이 표시되면 GA4 page_view, PostHog $pageview와 app_screen_view를 보낸다. |
| 첫 진입·같은 탭 반복 | 추가 측정 구현 시 중복될 위험이 있다. | 초기 GA config 조회 1회를 유지하고, 같은 화면의 연속 호출은 추가 조회로 세지 않는다. |
| 홈 화면 | 상세·계정·성경 선택 화면을 공통으로 비교하기 어려웠다. | app_screen_view로 실제 화면을 구분한다. 기존 History 기반 자동 조회와 겹치지 않도록 홈에서는 수동 page_view를 추가하지 않는다. |
| 홈의 성경 선택 준비 iframe | CSS로 숨겨져 있어도 브라우저의 visibilityState는 visible일 수 있다. | home-bible-picker iframe의 독립 수집을 막고, 부모가 실제로 연 선택창을 기록한다. |
| Reader 동의 정보 | 잘못된 JSON 또는 analytics 선택이 없는 값이 안내·수집을 막을 수 있었다. | 유효한 true/false 선택인지 확인하고, 없으면 선택 안내를 제공한다. |
| 동의 저장 실패 | 저장소 예외로 버튼 처리나 수집 시작이 중단될 수 있었다. | 그 문서에서 명시한 선택만 메모리로 유지한다. 다음 방문의 동의로 추정하지 않는다. |
| 다른 탭에서 동의 | 현재 열린 탭의 측정 시작과 화면 상태가 맞지 않을 수 있었다. | storage 변경과 공통 준비 신호를 연결한다. 거부 중 이동 이력을 되살려 전송하지 않고 현재 화면부터 반영한다. |
| 동의 철회 | 이미 로드된 수집기의 중지가 필요했다. | GA 비활성화, PostHog before_send 제외, Reader Clarity stop을 적용한다. 재허용 때 기존 ID를 초기화하지 않는다. |
| 배경에서 복귀·서랍 닫기 | 중간 상태가 먼저 기록될 위험이 있었다. | 표시된 최종 화면을 동기화하고, 같은 프레임의 중간 이동을 합친다. |

## 조회수와 사용자 수의 의미

- 한 사람이 본문 → 찾기 → 보관함을 보았다면 Reader의 조회는 3회가 될 수 있지만 사용자 수는 여전히 1명이다.
- 이 변경으로 화면 조회 누락과 확인된 동의 처리 공백을 보완한다. 기존 활성 사용자 1명이 실제로 몇 명이었는지 역산하지 않는다.
- GA4가 관리하는 사용자 ID, 세션 ID, first_visit, session_start, user_engagement를 임의 생성하거나 초기화하지 않는다.
- 동의 거부, 내부 점검 제외, 광고 차단기 및 전송 실패로 수집되지 않는 이용자를 강제로 기록하지 않는다.
- 철회 시 새 행동의 수집을 중지한다. 이미 SDK에 허용 상태로 저장된 버퍼나 진행 중 요청까지 모든 네트워크가 즉시 0이 된다고 보장하지 않는다.
- 홈의 app_screen_view는 별도 이벤트다. 모든 홈 상세 이동이 표준 GA4 ‘조회수’에 새 page_view로 추가된다는 뜻이 아니다.
- GA4 속성 시간대·데이터 필터·맞춤 측정기준 등록은 이 코드 변경과 별개이며 이번 작업에서 변경하지 않았다.

## 이벤트와 확인 위치

| 목적 | 이벤트/속성 | 확인 위치 |
| --- | --- | --- |
| Reader 화면 조회 | page_view / page_location의 `?screen=find`, `?screen=archive` 등 | GA4 페이지 및 화면, DebugView 또는 전송 요청 |
| 공통 화면 구분 | app_screen_view / screen_name, screen_group | GA4 이벤트 및 PostHog 이벤트 |
| PostHog 페이지 조회 | $pageview / $current_url, $title | PostHog 이벤트·페이지 조회 분석 |
| 수정본 구분 | analytics_version=`20261116-v2` | 이벤트 속성 |

GA4 탐색 보고서에서 screen_group 등 사용자 정의 속성을 쓰려면 관리자 등록 여부를 별도로 확인해야 한다. 이 작업은 보고서 생성이나 등록 완료를 포함하지 않는다. app_return_visit을 핵심 이벤트로 지정해 참여율을 인위적으로 높이지 않는다.

## 검증 방법과 범위

오프라인 VM/JSDOM에서 실제 화면 전환 함수와 실제 공통 수집 코드를 연결해 전송 큐를 확인한다. 운영 분석 도구에 테스트 방문을 발생시키지 않는다.

1. 분석 동의 상태로 Reader를 연 뒤 찾기 → 보관함 → 본문: 최초 조회 1회와 서로 다른 화면 이동 각각 1회.
2. 같은 탭 반복: 추가 조회 0회. 닫기 직후 다른 화면으로 이동: 잠깐 비친 중간 화면 0회.
3. 동의 전·거부·내부 점검·숨은 선택 iframe: 전송 0회.
4. 늦은 동의와 다른 탭 동의: 현재 화면을 반영하고 과거 거부 구간을 재생하지 않음.
5. 동의 철회·재허용·백그라운드 복귀: 최종 표시 화면과 향후 이벤트 URL이 일치.
6. 기존 홈 선택, Reader 복구, 실제 성경 데이터, 듣기 관련 회귀 시험.

이 시험은 브라우저 로직과 전송 큐 검증이다. 실제 iPhone/Android 기기, 광고 차단 환경, GA4/PostHog 서버 수신 또는 보고서 반영 시간 검증은 별도다. 운영 반영 후 서버 수신을 확인하기 전까지 ‘실제 사용자 통계 복구 완료’로 보고하지 않는다.

최종 결과: Node v24.22.1, jsdom 26.1.0에서 **22개 시험 파일, 190개 시험 통과**, 실패·건너뜀 0. 주요 앱 소스 9개는 실행 전후 SHA-256이 같았다. 변경된 외부 JS 7개 및 HTML의 인라인 스크립트 36개 문법 검사, `git diff --check`도 통과했다.

재현 명령 (`GOMNA_QA_MODULES`는 jsdom이 설치된 node_modules 경로):

```sh
GOMNA_QA_MODULES=/tmp/gomna-qa-deps/node_modules node --test \
  scripts/tests/gomna-ga4.test.mjs \
  scripts/tests/gomna-audio-telemetry.test.mjs \
  scripts/tests/gomna-audio-start-ready.test.mjs \
  scripts/tests/gomna-release-assets.test.mjs \
  tests/entry-consent-integration.test.cjs \
  tests/home-screen-analytics.test.cjs \
  tests/reader-screen-analytics.test.cjs \
  tests/reader-consent-analytics.test.cjs \
  tests/ux-telemetry.test.cjs \
  tests/home-picker-history.test.mjs \
  tests/home-picker-recovery.test.cjs \
  tests/reader-entry-recovery.test.cjs \
  tests/reader-local-panel-boot.test.cjs \
  tests/home-first-paint-navigation.test.cjs \
  tests/reader-panel-entry.test.mjs \
  tests/reader-touch-pan.test.cjs \
  tests/transition-stale-frame.test.mjs \
  tests/home-life-read-native-touch.test.mjs \
  tests/home-guide-return-card.test.mjs \
  tests/guide-navigation-minimal.test.mjs \
  tests/navigation-departure.test.mjs \
  tests/startup-recovery.test.mjs
```

## 적용 및 되돌리기

- 변경한 JS의 URL 버전과 정적 캐시만 v118로 준비한다. 성경·오디오·이미지 데이터 캐시와 사용자 기록은 유지한다.
- 97개 공개 HTML의 관련 스크립트 참조를 함께 갱신한다. 기존 4개 `/start/` 리다이렉트 문서에는 수집기를 중복 추가하지 않는다.
- 운영 반영 전 PR 검토 후, 승인된 배포 절차를 따른다. main 반영이나 배포는 이 문서 작성만으로 실행되지 않는다.
- 문제가 발생하면 코드 변경을 되돌리고 새로운 정적 캐시 버전을 사용한다. 사용자 저장소 전체 삭제로 해결하지 않는다.
