-- pg_cron (skipped by the local test runner, like the other *_platform.sql files).
select cron.schedule('end-service', '15 0 * * *', $$select public.sys_end_service()$$);
