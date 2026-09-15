-- 1-minute clock for push-send-reliable-test.
-- Official hosted docs: pg_cron + pg_net invoke an Edge Function; secrets stay in Vault.
-- Install fails unless these three Vault secrets already exist and are non-empty.
-- Do not put secret values in this file.
--   gomna_push_reliable_test_function_url
--   gomna_push_reliable_test_cron_secret
--   gomna_push_reliable_test_gateway_apikey
-- pg_net timeout is 240000ms (4 minutes): 32 sequential web-push sends plus
-- claim writes. 15000ms is not enough for the 32-device cap.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare
  missing text[] := array[]::text[];
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'gomna_push_reliable_test_function_url'
      and decrypted_secret is not null
      and decrypted_secret <> ''
  ) then
    missing := array_append(missing, 'gomna_push_reliable_test_function_url');
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'gomna_push_reliable_test_cron_secret'
      and decrypted_secret is not null
      and decrypted_secret <> ''
  ) then
    missing := array_append(missing, 'gomna_push_reliable_test_cron_secret');
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'gomna_push_reliable_test_gateway_apikey'
      and decrypted_secret is not null
      and decrypted_secret <> ''
  ) then
    missing := array_append(missing, 'gomna_push_reliable_test_gateway_apikey');
  end if;

  if coalesce(array_length(missing, 1), 0) > 0 then
    raise exception 'gomna_push_reliable_test cron install failed: missing vault secrets: %',
      array_to_string(missing, ', ');
  end if;
end $$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'gomna-push-send-reliable-test-every-minute';

select
  cron.schedule(
    'gomna-push-send-reliable-test-every-minute',
    '* * * * *',
    $cron$
    select
      net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'gomna_push_reliable_test_function_url'
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'gomna_push_reliable_test_gateway_apikey'
          ),
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'gomna_push_reliable_test_gateway_apikey'
          ),
          'x-gomna-push-reliable-test', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'gomna_push_reliable_test_cron_secret'
          )
        ),
        body := jsonb_build_object(
          'source', 'supabase-cron',
          'mode', 'reliable-test'
        ),
        timeout_milliseconds := 240000
      ) as request_id;
    $cron$
  );
