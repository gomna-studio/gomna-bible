do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'gomna-mail-send-daily-every-minute';
  if job_id is not null then perform cron.unschedule(job_id); end if;
end $$;
