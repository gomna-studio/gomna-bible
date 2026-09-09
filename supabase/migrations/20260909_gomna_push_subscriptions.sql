-- 은혜의말씀 Web Push 구독·발송 기록
-- 브라우저는 이 표에 직접 쓰지 않는다. Edge Function(service role)만 사용한다.

create table if not exists public.gomna_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint_hash text not null unique,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  locale text not null default 'ko',
  timezone text,
  user_id uuid references auth.users (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gomna_push_subscriptions_locale_check
    check (locale in ('ko', 'en', 'ja', 'zh'))
);

create table if not exists public.gomna_push_sends (
  send_date date not null,
  endpoint_hash text not null,
  verse_id text not null,
  status text not null default 'sent',
  sent_at timestamptz not null default now(),
  primary key (send_date, endpoint_hash, verse_id)
);

create index if not exists gomna_push_subscriptions_active_idx
  on public.gomna_push_subscriptions (active) where active = true;

alter table public.gomna_push_subscriptions enable row level security;
alter table public.gomna_push_sends enable row level security;

grant select, insert, update, delete on table public.gomna_push_subscriptions to service_role;
grant select, insert, update, delete on table public.gomna_push_sends to service_role;
