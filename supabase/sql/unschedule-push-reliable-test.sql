-- Tear down the reliable-test push clock and its two trial tables only.

select cron.unschedule(jobid)
from cron.job
where jobname = 'gomna-push-send-reliable-test-every-minute';

drop table if exists public.gomna_push_reliable_test_sends;
drop table if exists public.gomna_push_reliable_test_targets;
