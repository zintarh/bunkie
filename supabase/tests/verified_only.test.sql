-- Verified only: no new chats or resumed rooms before verification; search hides unverified hosts.

create schema tvo;
grant usage on schema tvo to authenticated, service_role, anon;
create function tvo.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create function tvo.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin execute p_sql; exception when others then v_msg := sqlerrm; end;
  if v_msg is null then raise exception 'expected failure (%), but it worked: %', p_like, p_sql using errcode = 'XX999'; end if;
  if v_msg not ilike p_like then raise exception 'expected %, got: %', p_like, v_msg using errcode = 'XX999'; end if;
end $$;
grant execute on all functions in schema tvo to authenticated, service_role, anon;

update public.settings set value = 'true' where key in ('require_verification_to_request', 'require_host_verification');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000c0001', 'host-vo@example.com', '{"first_name":"Kemi"}'),
  ('00000000-0000-0000-0000-0000000c0002', 'corper-vo@example.com', '{"first_name":"Uche"}');
update public.profiles set is_host = true where id = '00000000-0000-0000-0000-0000000c0001';
insert into public.listings (id, host_id, status, area_name, area_lat, area_lng, room_kind, household, rent_monthly, allowed_to_share, published_at, monthly_total)
values ('00000000-0000-0000-0000-0000000c0010', '00000000-0000-0000-0000-0000000c0001', 'paused', 'Kubwa', 9.15, 7.33, 'own_room', 'mixed', 30000, true, now(), 30000);

-- Unverified host: can't put the room back on; even if live, search doesn't show it.
set role authenticated;
select tvo.as_user('00000000-0000-0000-0000-0000000c0001');
select tvo.expect_error($$ select public.pause_listing('00000000-0000-0000-0000-0000000c0010', false) $$, '%under review%');
reset role;
update public.listings set status = 'live' where id = '00000000-0000-0000-0000-0000000c0010';
set role anon;
do $$ begin
  assert not exists (select 1 from public.find_rooms() where id = '00000000-0000-0000-0000-0000000c0010'), 'unverified host hidden';
end $$;
reset role;

-- Unverified corper: can't start a chat with the host.
update public.profiles set is_verified = true where id = '00000000-0000-0000-0000-0000000c0001';
set role authenticated;
select tvo.as_user('00000000-0000-0000-0000-0000000c0002');
select tvo.expect_error($$ select public.start_conversation('00000000-0000-0000-0000-0000000c0010') $$, '%verify your account%');
reset role;

-- Once verified: the room shows and the chat opens.
update public.profiles set is_verified = true where id = '00000000-0000-0000-0000-0000000c0002';
set role authenticated;
select tvo.as_user('00000000-0000-0000-0000-0000000c0002');
do $$ begin
  assert exists (select 1 from public.find_rooms() where id = '00000000-0000-0000-0000-0000000c0010'), 'verified host shown';
  assert public.start_conversation('00000000-0000-0000-0000-0000000c0010') is not null, 'chat opens';
end $$;
reset role;
