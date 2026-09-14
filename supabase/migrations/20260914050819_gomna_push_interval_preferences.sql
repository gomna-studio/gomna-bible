-- 오늘의 말씀 푸시: 지정 시각(하루 1·2회) 또는 반복 간격 설정.
-- 기존 구독은 fixed 모드로 유지되어 이전 설정과 발송 방식이 바뀌지 않는다.

alter table public.gomna_push_subscriptions
  add column if not exists schedule_mode text not null default 'fixed',
  add column if not exists interval_hours smallint not null default 1,
  add column if not exists interval_start_time text not null default '07:00',
  add column if not exists interval_end_time text not null default '22:00';

alter table public.gomna_push_subscriptions
  drop constraint if exists gomna_push_subscriptions_schedule_mode_check,
  drop constraint if exists gomna_push_subscriptions_interval_hours_check,
  drop constraint if exists gomna_push_subscriptions_interval_start_time_check,
  drop constraint if exists gomna_push_subscriptions_interval_end_time_check,
  drop constraint if exists gomna_push_subscriptions_interval_range_check;

alter table public.gomna_push_subscriptions
  add constraint gomna_push_subscriptions_schedule_mode_check
    check (schedule_mode in ('fixed', 'interval')),
  add constraint gomna_push_subscriptions_interval_hours_check
    check (interval_hours in (1, 2, 3, 4, 6, 12)),
  add constraint gomna_push_subscriptions_interval_start_time_check
    check (interval_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint gomna_push_subscriptions_interval_end_time_check
    check (interval_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint gomna_push_subscriptions_interval_range_check
    check (interval_start_time < interval_end_time);
