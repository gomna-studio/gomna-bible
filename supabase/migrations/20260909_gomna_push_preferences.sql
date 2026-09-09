-- 푸시 알림 시간/횟수. 기존 구독은 default(하루 1회 07:30)로 읽힌다.
-- 해지해도 시간·횟수는 남겨 다시 켤 때 복원한다.

alter table public.gomna_push_subscriptions
  add column if not exists frequency smallint not null default 1,
  add column if not exists first_send_time text not null default '07:30',
  add column if not exists second_send_time text not null default '20:30';

alter table public.gomna_push_subscriptions
  drop constraint if exists gomna_push_subscriptions_frequency_check;
alter table public.gomna_push_subscriptions
  add constraint gomna_push_subscriptions_frequency_check
  check (frequency in (1, 2));

alter table public.gomna_push_sends
  add column if not exists slot text not null default 'first';

alter table public.gomna_push_sends
  drop constraint if exists gomna_push_sends_pkey;
alter table public.gomna_push_sends
  add primary key (send_date, endpoint_hash, slot);
