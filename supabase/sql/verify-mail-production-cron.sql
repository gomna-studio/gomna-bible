select jobid, jobname, schedule, active, command
from cron.job
where jobname = 'gomna-mail-send-daily-every-minute';

select status, count(*)
from public.gomna_mail_sends
group by status
order by status;
