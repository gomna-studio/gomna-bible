do $$
declare
  target_job bigint;
begin
  select jobid into target_job
  from cron.job
  where jobname = 'gomna-push-send-daily-every-minute';
  if target_job is not null then perform cron.unschedule(target_job); end if;
end $$;
