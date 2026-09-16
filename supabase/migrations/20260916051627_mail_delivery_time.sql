-- User-selected local delivery time and reliable email delivery claims.
alter table public.gomna_mail_subscribers
  add column if not exists send_time time without time zone not null default '07:30';

alter table public.gomna_mail_sends
  add column if not exists attempt_count smallint not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists local_time text,
  add column if not exists last_error_kind text,
  add column if not exists last_http_status integer;

alter table public.gomna_mail_sends alter column sent_at drop not null;
alter table public.gomna_mail_sends alter column sent_at drop default;

create index if not exists gomna_mail_subscribers_due_idx
  on public.gomna_mail_subscribers (active, send_time) where active = true;

create index if not exists gomna_mail_sends_lookup_idx
  on public.gomna_mail_sends (send_date, email_hash, status);
