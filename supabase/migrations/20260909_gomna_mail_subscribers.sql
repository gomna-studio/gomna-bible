-- 은혜의말씀 오늘의 말씀 이메일 구독·발송 기록
-- 브라우저는 이 표에 직접 쓰지 않는다. Edge Function(service role)만 사용한다.

create table if not exists public.gomna_mail_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  email_hash text not null unique,
  active boolean not null default true,
  consented_at timestamptz not null default now(),
  locale text not null default 'ko',
  timezone text not null default 'Asia/Seoul',
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  constraint gomna_mail_subscribers_locale_check
    check (locale in ('ko', 'en', 'ja', 'zh'))
);

create table if not exists public.gomna_mail_sends (
  send_date date not null,
  email_hash text not null,
  verse_id text not null,
  status text not null default 'sent',
  provider_id text,
  error text,
  sent_at timestamptz not null default now(),
  primary key (send_date, email_hash, verse_id)
);

create index if not exists gomna_mail_subscribers_active_idx
  on public.gomna_mail_subscribers (active) where active = true;

alter table public.gomna_mail_subscribers enable row level security;
alter table public.gomna_mail_sends enable row level security;

grant select, insert, update, delete on table public.gomna_mail_subscribers to service_role;
grant select, insert, update, delete on table public.gomna_mail_sends to service_role;
