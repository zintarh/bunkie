-- Manual review while no identity provider is connected (IDENTITY_PROVIDER=manual in the verify function).
-- Each check is submitted as pending; the team passes or fails it in /admin/verifications.
--  * NIN: the number and date of birth are kept only until the decision, so the team can check them.
--    Passing a NIN needs the gender on the NIN record (it drives women-only and men-only homes).
--  * The app treats a pending check as submitted: people aren't asked again, and the verified
--    badge appears once every check has passed.

create or replace function public.sys_submit_verification(p_user uuid, p_kind text, p_provider text, p_result jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- A new submission replaces one still waiting.
  delete from private.verifications where user_id = p_user and kind = p_kind and status = 'pending';
  insert into private.verifications (user_id, kind, status, provider, result)
  values (p_user, p_kind, 'pending', p_provider, coalesce(p_result, '{}'));
end $$;
revoke execute on function public.sys_submit_verification(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.sys_submit_verification(uuid, text, text, jsonb) to service_role;

drop function public.admin_set_verification(uuid, text, boolean, text);
create or replace function public.admin_set_verification(
  p_user uuid, p_kind text, p_passed boolean, p_note text default null, p_gender public.gender default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_kind = 'nin' and p_passed and p_gender is null then
    perform private.fail('gender', 'Pick the gender on their NIN record.');
  end if;
  -- Close what was waiting; the NIN and date of birth go once decided.
  update private.verifications
  set status = case when p_passed then 'passed' else 'failed' end, decided_at = now(),
      result = (result - 'nin' - 'dob') || jsonb_build_object('note', p_note)
  where user_id = p_user and kind = p_kind and status = 'pending';
  perform public.sys_record_verification(p_user, p_kind, p_passed, 'admin', auth.uid()::text, null, p_gender,
                                         jsonb_build_object('note', p_note));
  perform private.audit('verification_' || case when p_passed then 'pass' else 'fail' end, 'user', p_user::text,
                        jsonb_build_object('kind', p_kind, 'note', p_note));
end $$;
revoke execute on function public.admin_set_verification(uuid, text, boolean, text, public.gender) from public, anon;
grant execute on function public.admin_set_verification(uuid, text, boolean, text, public.gender) to authenticated;

-- Waiting checks first, then the newest.
create or replace function public.admin_verifications(p_status text default null, p_kind text default null)
returns table (id uuid, user_id uuid, first_name text, kind text, status text, provider text, masked_name text,
  path text, result jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select v.id, v.user_id, p.first_name, v.kind, v.status, v.provider, v.masked_name,
         coalesce(v.doc_path, v.result ->> 'path'), v.result, v.created_at
  from private.verifications v
  join public.profiles p on p.id = v.user_id
  where (p_status is null or v.status = p_status) and (p_kind is null or v.kind = p_kind)
  order by (v.status = 'pending') desc, v.created_at desc
  limit 200;
end $$;

-- The admin overview counts checks waiting for review.
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'reports', (select count(*) from public.reports where status <> 'closed'),
    'chats', (select count(distinct conversation_id) from private.chat_flags where reviewed_at is null),
    'listings', (select count(*) from public.listings where status in ('in_review', 'flagged')),
    'verifications', (select count(*) from private.verifications where status = 'pending'),
    'suspended', (select count(*) from public.profiles where suspended_at is not null),
    'live_listings', (select count(*) from public.listings where status = 'live'),
    'open_bookings', (select count(*) from public.bookings where status not in ('closed', 'completed')),
    'people', (select count(*) from public.profiles)
  );
end $$;
