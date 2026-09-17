# 운영 알림 수정본

## 무엇을 고쳤나

1. GitHub 예약 작업이 건너뛰어도 알림이 사라지지 않도록 Supabase에서 1분마다 발송 함수를 부릅니다.
2. 같은 휴대폰의 같은 시간 알림은 먼저 DB에서 한 번만 차지한 뒤 보냅니다. 두 시계가 함께 실행돼도 중복 발송하지 않습니다.
3. 잠깐 실패한 발송은 최대 3번 다시 시도합니다. 이미 발송된 기록과 아직 처리 중인 기록은 다시 보내지 않습니다.
4. `interval-0916` 같은 실제 시간 칸을 알림 `tag`와 `data.slot`에 그대로 보존합니다.
5. 맥북은 iPhone 확인 알림 대상이 아니므로, 확인 알림을 보내지 않았다는 주황색 거짓 오류를 표시하지 않습니다.
6. 기존 `sw.js`의 “알림을 먼저 보여주고 보고는 나중에 하기” 수정은 그대로 보존했습니다.

## 안전한 배포 순서

아래 순서를 바꾸지 않습니다.

1. `20260916004439_gomna_push_production_reliable_delivery.sql`을 DB에 적용합니다.
2. `push-send-daily` 함수를 배포합니다.
3. Supabase Vault에 아래 이름으로 값 3개를 저장합니다. 운영 적용 도구를 사용하면 새 Cron 비밀열쇠는 DB 안에서 자동 생성할 수 있습니다.
   - `gomna_push_daily_function_url`: `https://noogfnsgvewpbjpafnxc.supabase.co/functions/v1/push-send-daily`
   - `gomna_push_cron_secret`: 현재 운영 함수의 `PUSH_CRON_SECRET`과 똑같은 값
   - `gomna_push_gateway_apikey`: Supabase 기본 publishable key
4. `supabase/sql/install-push-production-cron.sql`을 적용합니다.
5. `supabase/sql/verify-push-production-cron.sql`로 1분 작업과 발송 기록을 확인합니다.
6. 실제 iPhone에서 가까운 미래 시각을 정해 한 번 최종 확인합니다.

Vault 값이 하나라도 없으면 설치 SQL은 중간 성공을 하지 않고 즉시 멈춥니다. 비밀 값은 이 압축 파일에 들어 있지 않습니다.

기존 GitHub 15분 예약은 당분간 예비 시계로 남깁니다. 새 코드가 DB에서 한 번만 차지하기 때문에 두 시계가 동시에 깨워도 같은 알림을 두 번 보내지 않습니다.

## 되돌리기

문제가 생기면 먼저 `supabase/sql/unschedule-push-production-cron.sql`을 적용합니다. 그러면 새 1분 시계만 멈추고 기존 GitHub 예비 시계는 계속 남습니다. 그다음 이전 `push-send-daily` 함수를 다시 배포하면 됩니다.

새 DB 칼럼은 기존 기록을 지우지 않는 추가 칼럼이므로 급하게 삭제하지 않습니다.

## 자동시험

- 새 운영 발송·맥북 오류·표시 순서 시험: 19개
- 기존 격리 시험판 시험: 50개
- 합계: 69개 통과, 실패 0개

전달받은 압축본에는 `js/gomna-push-prefs.js`와 `scripts/push/today-word.js`가 없어서, 그 파일을 직접 불러오는 기존 시험 2개는 이 압축본만으로 실행할 수 없습니다. 해당 시험 파일은 수정하지 않았습니다.

## 2026-09-16 운영 반영 상태

- 운영 DB 마이그레이션 적용 완료
- `push-send-daily` 함수 v10 활성화 완료
- Supabase 1분 Cron 활성화 완료
- Cron 실행 성공 및 함수 HTTP 200 확인
- 10:00 알림 5건이 10:07 보충 발송되어 모두 `sent`, 1회 시도로 기록됨
- CEO iPhone의 `interval-1016` 알림이 정확히 10:16:00 KST에 `sent`, 1회 시도로 기록됨
- GitHub PR #140 병합 완료

이 문서의 배포 순서는 같은 수정본을 다른 환경에 다시 적용할 때 사용합니다.
