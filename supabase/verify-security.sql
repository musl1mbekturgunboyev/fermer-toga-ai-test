-- Read-only post-deploy checks. No secrets or tokens are selected.
select has_table_privilege('authenticated','public.listings','UPDATE') as client_listing_update,
 has_table_privilege('authenticated','public.push_subs','INSERT') as client_push_insert,
 has_table_privilege('authenticated','public.push_subs','UPDATE') as client_push_update,
 has_table_privilege('authenticated','public.app_state','UPDATE') as client_state_update;
-- All above must be false.
select has_function_privilege('authenticated','public.set_listing_status(uuid,uuid,text)','EXECUTE') as client_listing_rpc,
 has_function_privilege('service_role','public.reserve_ai_quota(uuid,text,uuid)','EXECUTE') as server_quota_rpc;
-- false, true.
select jobname,schedule,active from cron.job where jobname='fermer-reminders-every-minute';
-- One active job, '* * * * *'.
select state,count(*) from public.ai_usage where at>=date_trunc('month',now()) group by state;
