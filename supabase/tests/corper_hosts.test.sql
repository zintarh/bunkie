-- Corp member hosts: the badge needs a passed check that matches the answer, and can't be set by hand.

create schema tc;
grant usage on schema tc to authenticated, service_role;
create function tc.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
grant execute on all functions in schema tc to authenticated, service_role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'kemi@example.com', '{"first_name":"Kemi"}');

set role authenticated;
select tc.as_user('00000000-0000-0000-0000-0000000000c1');

-- Saying "served" alone earns nothing.
update public.profiles set corper_status = 'served' where id = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  assert not (select corper_verified from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), 'unverified claim';
end $$;

-- The badge flag can't be written by the user.
do $$ begin
  begin
    update public.profiles set corper_verified = true where id = '00000000-0000-0000-0000-0000000000c1';
    raise exception 'corper_verified should not be writable' using errcode = 'XX999';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A passed discharge certificate check backs up "served".
set role service_role;
select public.sys_record_verification('00000000-0000-0000-0000-0000000000c1', 'discharge', true, 'test', 'ref');
reset role;
do $$ begin
  assert (select corper_verified from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), 'served verified';
end $$;

-- Switching to "serving" needs a call-up check instead, so the badge drops until then.
set role authenticated;
select tc.as_user('00000000-0000-0000-0000-0000000000c1');
update public.profiles set corper_status = 'serving' where id = '00000000-0000-0000-0000-0000000000c1';
reset role;
do $$ begin
  assert not (select corper_verified from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), 'serving needs call-up';
end $$;

set role service_role;
select public.sys_record_verification('00000000-0000-0000-0000-0000000000c1', 'call_up', true, 'test', 'ref');
reset role;
do $$ begin
  assert (select corper_verified from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), 'serving verified';
end $$;

-- "Not a corp member" never shows a badge.
set role authenticated;
select tc.as_user('00000000-0000-0000-0000-0000000000c1');
update public.profiles set corper_status = 'not_corper' where id = '00000000-0000-0000-0000-0000000000c1';
reset role;
do $$ begin
  assert not (select corper_verified from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'), 'not a corper';
end $$;
