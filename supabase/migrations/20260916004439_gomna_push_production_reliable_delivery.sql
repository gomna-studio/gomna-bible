create extension if not exists supabase_vault with schema vault;

alter table public.gomna_push_sends
  add column if not exists attempt_count smallint not null default 0,
  add column if not exists last_error_kind text,
  add column if not exists last_http_status integer,
  add column if not exists local_time text,
  add column if not exists claimed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.gomna_push_sends alter column sent_at drop not null;
alter table public.gomna_push_sends alter column sent_at drop default;
alter table public.gomna_push_sends alter column status set default 'claimed';

update public.gomna_push_sends
set attempt_count = greatest(attempt_count, 1), updated_at = coalesce(sent_at, now())
where status = 'sent';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gomna_push_sends'::regclass
      and conname = 'gomna_push_sends_status_check'
  ) then
    alter table public.gomna_push_sends
      add constraint gomna_push_sends_status_check
      check (status in ('claimed', 'sent', 'failed'));
  end if;
end $$;

create index if not exists gomna_push_sends_retry_idx
  on public.gomna_push_sends (status, attempt_count, claimed_at)
  where status in ('claimed', 'failed');

alter table public.gomna_push_sends enable row level security;
revoke all on table public.gomna_push_sends from anon, authenticated;
grant all on table public.gomna_push_sends to service_role;

create or replace function public.gomna_validate_push_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from vault.decrypted_secrets
    where name = 'gomna_push_cron_secret'
      and decrypted_secret = p_secret
  ), false);
$$;

revoke all on function public.gomna_validate_push_cron_secret(text) from public, anon, authenticated;
grant execute on function public.gomna_validate_push_cron_secret(text) to service_role;
