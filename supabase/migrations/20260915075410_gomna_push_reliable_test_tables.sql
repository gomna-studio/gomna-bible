-- Isolated tables for push-send-reliable-test only.
-- Do not grant to anon, authenticated, or PUBLIC. No RLS policies are created.
-- service_role bypasses RLS and is the only role that can read or write.

create table if not exists public.gomna_push_reliable_test_targets (
  endpoint_hash text primary key,
  note text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gomna_push_reliable_test_sends (
  send_date date not null,
  endpoint_hash text not null,
  slot text not null,
  status text not null default 'claimed',
  attempt_count smallint not null default 0,
  last_error_kind text,
  last_http_status integer,
  local_time text,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint gomna_push_reliable_test_sends_status_check
    check (status in ('claimed', 'sent', 'failed')),
  primary key (send_date, endpoint_hash, slot)
);

create index if not exists gomna_push_reliable_test_targets_enabled_idx
  on public.gomna_push_reliable_test_targets (enabled)
  where enabled = true;

create index if not exists gomna_push_reliable_test_sends_open_idx
  on public.gomna_push_reliable_test_sends (status, attempt_count)
  where status in ('claimed', 'failed');

alter table public.gomna_push_reliable_test_targets enable row level security;
alter table public.gomna_push_reliable_test_sends enable row level security;

revoke all on table public.gomna_push_reliable_test_targets from public;
revoke all on table public.gomna_push_reliable_test_targets from anon;
revoke all on table public.gomna_push_reliable_test_targets from authenticated;
revoke all on table public.gomna_push_reliable_test_sends from public;
revoke all on table public.gomna_push_reliable_test_sends from anon;
revoke all on table public.gomna_push_reliable_test_sends from authenticated;

grant select, insert, update, delete on table public.gomna_push_reliable_test_targets to service_role;
grant select, insert, update, delete on table public.gomna_push_reliable_test_sends to service_role;
