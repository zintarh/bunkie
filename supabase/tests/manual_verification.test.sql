-- Manual review: checks wait as pending, the team decides, the NIN goes once decided, the badge follows.

create schema tmv;
grant usage on schema tmv to authenticated, service_role, anon;
create function tmv.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create function tmv.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin execute p_sql; exception when others then v_msg := sqlerrm; end;
  if v_msg is null then raise exception 'expected failure (%), but it worked: %', p_like, p_sql using errcode = 'XX999'; end if;
  if v_msg not ilike p_like then raise exception 'expected %, got: %', p_like, v_msg using errcode = 'XX999'; end if;
end $$;
grant execute on all functions in schema tmv to authenticated, service_role, anon;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000a0001', 'admin-mv@example.com', '{"first_name":"Ada"}'),
  ('00000000-0000-0000-0000-0000000a0002', 'corper-mv@example.com', '{"first_name":"Bisi"}');
insert into private.admins (user_id) values ('00000000-0000-0000-0000-0000000a0001');

-- The verify function submits each check (service role).
select public.sys_record_verification('00000000-0000-0000-0000-0000000a0002', 'phone', true, 'supabase_auth', 'x');
select public.sys_submit_verification('00000000-0000-0000-0000-0000000a0002', 'nin', 'manual', '{"nin":"12345678901","dob":"2000-01-02"}');
select public.sys_submit_verification('00000000-0000-0000-0000-0000000a0002', 'liveness', 'manual', '{"path":"x/selfie.jpg"}');
select public.sys_submit_verification('00000000-0000-0000-0000-0000000a0002', 'call_up', 'manual', '{"path":"x/call.pdf","state_code":"FC/26B/1234"}');
-- Sending the selfie again replaces the one waiting.
select public.sys_submit_verification('00000000-0000-0000-0000-0000000a0002', 'liveness', 'manual', '{"path":"x/selfie2.jpg"}');
do $$ begin
  assert (select count(*) from private.verifications where user_id = '00000000-0000-0000-0000-0000000a0002' and kind = 'liveness') = 1, 'one selfie waiting';
  assert not (select is_verified from public.profiles where id = '00000000-0000-0000-0000-0000000a0002'), 'not verified while waiting';
end $$;

-- People can't submit or decide for themselves.
set role authenticated;
select tmv.as_user('00000000-0000-0000-0000-0000000a0002');
select tmv.expect_error($$ select public.sys_submit_verification('00000000-0000-0000-0000-0000000a0002', 'nin', 'manual', '{}') $$, '%permission denied%');
select tmv.expect_error($$ select public.admin_set_verification('00000000-0000-0000-0000-0000000a0002', 'nin', true, null, 'female') $$, '%not allowed%');
do $$ begin
  assert (select count(*) from public.my_verification() where status = 'pending') = 3, 'own checks show as waiting';
end $$;

-- The team: waiting checks come first and count on the overview; a NIN pass needs the gender.
select tmv.as_user('00000000-0000-0000-0000-0000000a0001');
do $$ begin
  assert (public.admin_overview() ->> 'verifications')::int >= 3, 'waiting checks counted';
  assert (select status from public.admin_verifications() limit 1) = 'pending', 'waiting first';
end $$;
select tmv.expect_error($$ select public.admin_set_verification('00000000-0000-0000-0000-0000000a0002', 'nin', true) $$, '%gender%');
select public.admin_set_verification('00000000-0000-0000-0000-0000000a0002', 'nin', true, null, 'female');
select public.admin_set_verification('00000000-0000-0000-0000-0000000a0002', 'liveness', true);
select public.admin_set_verification('00000000-0000-0000-0000-0000000a0002', 'call_up', true);
reset role;

-- They have their PPA: the acceptance letter has to pass too before the badge.
select public.sys_submit_verification('00000000-0000-0000-0000-0000000a0002', 'ppa_letter', 'manual', '{"path":"x/ppa.pdf"}');
select public.sys_record_verification('00000000-0000-0000-0000-0000000a0002', 'phone', true, 'supabase_auth', 'y');
do $$ begin
  assert not (select is_verified from public.profiles where id = '00000000-0000-0000-0000-0000000a0002'), 'PPA letter still waiting';
end $$;
set role authenticated;
select tmv.as_user('00000000-0000-0000-0000-0000000a0001');
select public.admin_set_verification('00000000-0000-0000-0000-0000000a0002', 'ppa_letter', true);
reset role;

do $$ begin
  assert (select is_verified from public.profiles where id = '00000000-0000-0000-0000-0000000a0002'), 'verified once all passed';
  assert (select gender from public.profile_private where user_id = '00000000-0000-0000-0000-0000000a0002') = 'female', 'gender from the NIN record';
  assert not exists (select 1 from private.verifications where user_id = '00000000-0000-0000-0000-0000000a0002' and status = 'pending'), 'nothing left waiting';
  assert not exists (select 1 from private.verifications where user_id = '00000000-0000-0000-0000-0000000a0002' and result ? 'nin'), 'NIN removed once decided';
end $$;

do $$ begin
  assert exists (select 1 from private.jobs where payload ->> 'template' = 'verified'
                 and payload ->> 'user_id' = '00000000-0000-0000-0000-0000000a0002'), 'told they are verified';
end $$;
