-- Validate the daily-mail cron secret without exposing it to Edge Functions.
create or replace function public.gomna_verify_mail_cron_secret(p_candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(p_candidate), '') is not null
    and p_candidate = (
      select secret.decrypted_secret
      from vault.decrypted_secrets secret
      where secret.name = 'gomna_mail_cron_secret'
      order by secret.updated_at desc
      limit 1
    ),
    false
  );
$$;

revoke all on function public.gomna_verify_mail_cron_secret(text) from public, anon, authenticated;
grant execute on function public.gomna_verify_mail_cron_secret(text) to service_role;
