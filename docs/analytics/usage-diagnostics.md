# 이용 현황 측정과 GA4 화면 구성

기준: main 3c609036. 이 문서의 항목은 구현 계약이며 GA4 설정 완료 증명이 아니다.

## 대표님이 볼 항목

| 질문 | GA4 이벤트 | 등록할 값 / 해석 |
|---|---|---|
| 어떤 화면을 마지막으로 확인했나? | screen_observed | screen_name, observation_reason. pagehide/hidden은 마지막 관측 후보이지 확정 이탈이 아님 |
| 얼마나 들었나? | audio_listen_time | listen_seconds 합계 ÷ 60 = 청취 분. 음원 진행을 기반으로 계산한 재생 시간이며 사람이 들었다는 증거는 아님 |
| 재생까지 얼마나 기다렸나? | audio_started | startup_seconds 평균. 엔진 재생 요청부터 소리가 시작될 때까지; 버튼 클릭 전 UI 대기는 미포함 |
| 3초 넘게 기다린 요청은? | audio_start_slow | 이벤트 수; 운영 진단용 임시 기준이며 업계 기준이 아님 |
| 왜 재생하지 못했나? | audio_failure | failure_reason 별 이벤트 수 |

## GA4에서 필요한 설정 (아직 미적용)

관리 → 맞춤 정의에서 이벤트 범위 측정기준: screen_name(화면), observation_reason(기록 시점), audio_type(음원 종류), request_kind(직접/자동 요청), failure_reason(실패 사유).
맞춤 측정항목: listen_seconds(청취 시간, 초), startup_seconds(재생 대기, 초), visible_seconds(화면 표시 시간, 초).
탐색에 ‘은혜의말씀 이용 점검’을 만들고 세 탭 구성:
1. 마지막 관측 화면: screen_observed에서 observation_reason=hidden 또는 pagehide. 화면별 수치는 확정 이탈자 수가 아님. 세션의 마지막 화면은 경로 탐색의 종료 지점과 함께 확인.
2. 청취 시간: audio_listen_time, 합계 청취 시간 / 사용자 / 날짜 / 기기. 합계와 사용자당 평균을 별도로 표기.
3. 재생 문제: audio_request/audio_started/audio_start_slow/audio_failure, request_kind별 분리. 자동 절 전환을 사용자 버튼 클릭 횟수로 세지 말 것.

## 한계와 후속 확인

- 과거 청취 시간은 소급 복원 불가. 배포 이후 분석 동의한 방문부터 수집.
- analytics 거부/내부 방문 제외 적용. 별도 개인 식별자나 원문 검색어를 새로 저장하지 않음.
- 강제 종료, 브라우저 정지, 네트워크 실패 시 끝부분이 누락될 수 있음. 30초마다 증분 전송하며 전송 확인/중복 재시도는 하지 않음.
- 화면 숨김은 앱 전환일 수도 있음. ‘나간 이유’와 ‘확정 이탈’로 표현하지 않음.
- 홈/본문/묵상/길잡이 이미지와 해시로 표시되는 인물·이야기 분류. 본문 안의 모든 팝업이나 내부 카드까지 식별하는 것은 아님.
- 운영 음원 파일과 재생 제어는 바꾸지 않음. 앱 코드 캐시만 v102 갱신, 데이터/로그인/음원 캐시 유지.
- 새 측정 시험 5개, 기존 GA4 시험 15개 통과. 기존 시작 준비 시험 14개 중 1개는 main에서도 동일 실패: unfinished next fetch is aborted before native loading and stale completion cannot replace it. 이 실패는 별도 원인 확인 필요.

## 문제별 개선 방향

manifest_loading: 자료 준비 후 재생 가능 상태와 안내를 명확히 할지 검토.
manifest_not_loaded/config_not_found: 자료 요청 실패와 연결 상태 확인.
not_found/not_published/voice_unavailable: 실제 제공 가능한 음원과 버튼 표시 대조.
play_rejected/resume_rejected: 기기별 자동재생 정책과 사용자의 재생 동작 흐름 확인.
play_error: 파일 응답/형식/네트워크 재현 후 수정.
청취 도중 이탈이나 느림은 위 기록이 쌓인 후 기기·방문 경로별로 비교. 수치 없이 원인을 단정하지 않음.
