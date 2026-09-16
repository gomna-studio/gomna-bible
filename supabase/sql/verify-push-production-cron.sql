select jobid, jobname, schedule, active
from cron.job
where jobname = 'gomna-push-send-daily-every-minute';

select status, start_time, end_time, return_message
from cron.job_run_details
where jobid = (
  select jobid from cron.job where jobname = 'gomna-push-send-daily-every-minute'
)
order by start_time desc
limit 10;

select count(*) as active_subscriptions
from public.gomna_push_subscriptions
where active = true;

select send_date, endpoint_hash, slot, status, attempt_count,
  local_time, claimed_at at time zone 'Asia/Seoul' as claimed_kst,
  sent_at at time zone 'Asia/Seoul' as sent_kst,
  last_error_kind, last_http_status
from public.gomna_push_sends
order by updated_at desc
limit 20;
