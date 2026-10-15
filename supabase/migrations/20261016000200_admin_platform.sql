-- Admins can open verification documents and chat photos while reviewing (signed links in the browser).
create policy "admins read kyc" on storage.objects for select to authenticated
  using (bucket_id = 'kyc' and private.is_admin());
create policy "admins read chat photos" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and private.is_admin());
