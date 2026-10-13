-- Supabase platform pieces: storage buckets and scheduled jobs.
-- Needs these Vault secrets (see README): project_url, service_role_key.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('listing-photos', 'listing-photos', true, 1048576, array['image/webp', 'image/jpeg']),
  ('avatars', 'avatars', true, 524288, array['image/webp', 'image/jpeg']),
  ('kyc', 'kyc', false, 5242880, array['image/webp', 'image/jpeg', 'application/pdf']),
  ('condition', 'condition', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

-- listing-photos/{listing_id}/{uuid}.webp: the host uploads, everyone reads (bucket is public).
create policy "host uploads listing photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos'
              and private.owns_listing(((storage.foldername(name))[1])::uuid));
create policy "host removes listing photos" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos'
         and private.owns_listing(((storage.foldername(name))[1])::uuid));

-- avatars/{user_id}/{uuid}.webp
create policy "own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- kyc/{user_id}/...: upload only. Nobody reads it from the app; Edge Functions use the service key.
create policy "upload own documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- condition/{booking_id}/...: both parties to the booking.
create policy "parties upload condition photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'condition' and private.is_party(((storage.foldername(name))[1])::uuid));
create policy "parties read condition photos" on storage.objects for select to authenticated
  using (bucket_id = 'condition' and private.is_party(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Deadlines: every minute.
select cron.schedule('expire-bookings', '* * * * *', $$ select public.sys_expire_overdue(500) $$);

-- Queue worker: every 10 seconds.
select cron.schedule('run-worker', '10 seconds', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000)
$$);

-- Housekeeping: finished jobs older than 14 days.
select cron.schedule('prune-jobs', '17 3 * * *', $$
  delete from private.jobs where done_at < now() - interval '14 days'
$$);

-- Live updates on the booking screen (only that screen subscribes).
alter publication supabase_realtime add table public.bookings;
