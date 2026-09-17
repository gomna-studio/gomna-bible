-- Apply only after the production schema migration and push-send-daily deployment.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
declare
  missing text[];
begin
  select array_agg(required.name order by required.name)
  into missing
  from (values
    ('gomna_push_daily_function_url'),
    ('gomna_push_cron_secret'),
    ('gomna_push_gateway_apikey')
  ) as required(name)
  left join vault.decrypted_secrets secret on secret.name = required.name
  where nullif(btrim(secret.decrypted_secret), '') is null;
  if coalesce(array_length(missing, 1), 0) > 0 then
    raise exception 'production push cron install stopped; missing Vault secrets: %', array_to_string(missing, ', ');
  end if;
end $$;

do $$
declare
  old_job bigint;
begin
  select jobid into old_job from cron.job where jobname = 'gomna-push-send-daily-every-minute';
  if old_job is not null then perform cron.unschedule(old_job); end if;
end $$;

select cron.schedule(
  'gomna-push-send-daily-every-minute', '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'gomna_push_daily_function_url' order by updated_at desc limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'gomna_push_gateway_apikey' order by updated_at desc limit 1),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'gomna_push_gateway_apikey' order by updated_at desc limit 1),
      'x-gomna-push-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'gomna_push_cron_secret' order by updated_at desc limit 1)
    ),
    body := '{"mode":"daily","source":"supabase-cron"}'::jsonb,
    timeout_milliseconds := 240000
  );
  $job$
);
