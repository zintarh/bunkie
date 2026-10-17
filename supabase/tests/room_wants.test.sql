-- "Post what you need": one open post each, visible to others only as first name/area/batch,
-- offers only from live rooms, closed by booking, matched against rooms.

create schema twn;
grant usage on schema twn to authenticated, service_role, anon;
create function twn.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create function twn.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin execute p_sql; exception when others then v_msg := sqlerrm; end;
  if v_msg is null then raise exception 'expected failure (%), but it worked: %', p_like, p_sql using errcode = 'XX999'; end if;
  if v_msg not ilike p_like then raise exception 'expected %, got: %', p_like, v_msg using errcode = 'XX999'; end if;
end $$;
grant execute on all functions in schema twn to authenticated, service_role, anon;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007a1', 'corper-7a1@example.com', '{"first_name":"Amaka","last_name":"Okafor"}'),
  ('00000000-0000-0000-0000-0000000007b1', 'host-7b1@example.com', '{"first_name":"Bayo"}'),
  ('00000000-0000-0000-0000-0000000007c1', 'someone-7c1@example.com', '{"first_name":"Chi"}');
update public.profile_private set batch_id = '2026-B1' where user_id = '00000000-0000-0000-0000-0000000007a1';
update public.settings set value = 'false' where key = 'require_verification_to_request';
insert into public.listings (id, host_id, status, area_name, area_lat, area_lng, room_kind, household, rent_monthly, allowed_to_share, published_at, monthly_total)
values ('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007b1', 'live', 'Utako', 9.069, 7.435, 'own_room', 'mixed', 60000, true, now(), 60000),
       ('00000000-0000-0000-0000-0000000007d2', '00000000-0000-0000-0000-0000000007b1', 'draft', 'Utako', 9.069, 7.435, 'own_room', 'mixed', 60000, false, null, 60000);

set role authenticated;
select twn.as_user('00000000-0000-0000-0000-0000000007a1');
select twn.expect_error($$ select public.post_want('Lagos', 6.5, 3.4) $$, '%Abuja%');
select public.post_want('Utako', 9.068, 7.442, 7::smallint, 80000, current_date + 20, 3, null, 'own_room', 'mixed_ok', 'Quiet, I work nearby');
-- Posting again replaces the open one.
select public.post_want('Utako', 9.068, 7.442, 7::smallint, 70000, current_date + 20, 3, null, 'own_room', 'mixed_ok', null);
do $$ begin
  assert (select count(*) from public.room_wants where status = 'open') = 1, 'one open post';
  assert (select matches from public.my_want()) >= 1, 'the Utako room already matches';
end $$;

-- Someone else (not a host, not verified) sees it as first name, area and batch, nothing more.
select twn.as_user('00000000-0000-0000-0000-0000000007c1');
do $$ declare r record; begin
  select * into r from public.want_feed();
  assert r.first_name = 'Amaka' and r.area_label = 'Utako' and r.batch_label = 'Batch B 2026', format('feed row %s', r);
  assert (select count(*) from public.room_wants) = 0, 'raw posts are not readable';
end $$;
select twn.expect_error($$ select public.offer_room((select id from public.want_feed() limit 1), '00000000-0000-0000-0000-0000000007d1') $$, '%not found%');

-- The host offers their live room (not the draft): a chat opens with the room attached.
select twn.as_user('00000000-0000-0000-0000-0000000007b1');
select twn.expect_error($$ select public.offer_room((select id from public.want_feed() limit 1), '00000000-0000-0000-0000-0000000007d2') $$, '%live rooms%');
do $$ declare r record; begin
  select * into r from public.want_feed('00000000-0000-0000-0000-0000000007d1');
  assert r.fits_budget and r.fits_household and r.minutes <= 10, format('fit for the host''s room %s', r);
end $$;
create temp table cv as select public.offer_room((select id from public.want_feed() limit 1), '00000000-0000-0000-0000-0000000007d1') as id;
grant select on cv to authenticated;
reset role;
do $$ begin
  assert exists (select 1 from public.messages where conversation_id = (select id from cv) and meta ->> 'type' = 'offer'), 'offer in the chat';
  assert (select tenant_id from public.conversations where id = (select id from cv)) = '00000000-0000-0000-0000-0000000007a1', 'chat with the corper';
end $$;
-- The host's own offer note is read for them; it's new for the corper.
set role authenticated;
select twn.as_user('00000000-0000-0000-0000-0000000007b1');
do $$ begin assert public.unread_chats() = 0, 'own offer note is not unread for the host'; end $$;
select twn.as_user('00000000-0000-0000-0000-0000000007a1');
do $$ begin assert public.unread_chats() = 1, 'offer is unread for the corper'; end $$;
reset role;
set role authenticated;
select twn.as_user('00000000-0000-0000-0000-0000000007a1');
do $$ begin assert (select offers from public.my_want()) = 1, 'corper sees the offer count'; end $$;
reset role;

-- Booking closes the post.
insert into public.bookings (id, listing_id, tenant_id, host_id, status, move_in, months, move_out, monthly_total)
values ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007a1',
        '00000000-0000-0000-0000-0000000007b1', 'agreed', current_date + 20, 3, current_date + 110, 60000);
update public.bookings set status = 'paid' where id = '00000000-0000-0000-0000-0000000007e1';
do $$ begin
  assert (select status from public.room_wants where author_id = '00000000-0000-0000-0000-0000000007a1' order by created_at desc limit 1) = 'booked', 'post closed on booking';
end $$;
update public.listings set status = 'archived' where id in ('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007d2');
