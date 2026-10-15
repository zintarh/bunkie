-- Publish one-sided reviews once their 14-day window closes (skipped by the local test runner).
select cron.schedule('publish-reviews', '30 1 * * *', $$select public.sys_publish_due_reviews()$$);
