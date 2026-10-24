-- Reviews: only the two people, only after the stay, hidden until both are in, then averaged.

create schema trv;
grant usage on schema trv to authenticated, service_role, anon;
create function trv.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create function trv.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin execute p_sql; exception when others then v_msg := sqlerrm; end;
  if v_msg is null then raise exception 'expected failure (%), but it worked: %', p_like, p_sql using errcode = 'XX999'; end if;
  if v_msg not ilike p_like then raise exception 'expected %, got: %', p_like, v_msg using errcode = 'XX999'; end if;
end $$;
grant execute on all functions in schema trv to authenticated, service_role, anon;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'host-d1@example.com', '{"first_name":"Dayo"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'corper-d2@example.com', '{"first_name":"Funmi"}'),
  ('00000000-0000-0000-0000-0000000000d3', 'other-d3@example.com', '{"first_name":"Gbenga"}');
-- Hosts are verified before their rooms show in search.
update public.profiles set is_verified = true where id = '00000000-0000-0000-0000-0000000000d1';
insert into public.listings (id, host_id, status, area_name, room_kind, household, rent_monthly, allowed_to_share, published_at, monthly_total)
values ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000d1', 'live', 'Lugbe', 'own_room', 'mixed', 30000, true, now(), 30000);
-- A stay that ended three days ago, and one still going.
insert into public.bookings (id, listing_id, tenant_id, host_id, status, move_in, months, move_out, monthly_total)
values ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-0000000000d1', 'moved_out', current_date - 33, 1, current_date - 3, 30000),
       ('00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000d3',
        '00000000-0000-0000-0000-0000000000d1', 'active', current_date - 3, 3, current_date + 87, 30000);

set role authenticated;
-- Not the people in the stay; a stay still going; missing star ratings.
select trv.as_user('00000000-0000-0000-0000-0000000000d3');
select trv.expect_error($$ select public.submit_review('00000000-0000-0000-0000-0000000000e9', 5, 5, 5, 5) $$, '%not found%');
select trv.expect_error($$ select public.submit_review('00000000-0000-0000-0000-0000000000ea', 5, 5, 5, 5) $$, '%when the stay ends%');
select trv.as_user('00000000-0000-0000-0000-0000000000d2');
select trv.expect_error($$ select public.submit_review('00000000-0000-0000-0000-0000000000e9', 5) $$, '%accuracy%');

-- Corper reviews: hidden from everyone else until the host reviews too.
select public.submit_review('00000000-0000-0000-0000-0000000000e9', 4, 5, 4, 5, null, 'Room was exactly as shown.');
select trv.expect_error($$ select public.submit_review('00000000-0000-0000-0000-0000000000e9', 3, 3, 3, 3) $$, '%already reviewed%');
select trv.as_user('00000000-0000-0000-0000-0000000000d3');
do $$ begin
  assert (select count(*) from public.reviews) = 0, 'hidden from others while one-sided';
  assert (select count(*) from public.listing_reviews('00000000-0000-0000-0000-0000000000d9')) = 0, 'not on the room page yet';
end $$;

-- Host reviews: both publish, averages update, the room page and the corper's profile show them.
select trv.as_user('00000000-0000-0000-0000-0000000000d1');
select public.submit_review('00000000-0000-0000-0000-0000000000e9', 5, null, 5, null, 5, 'Kept the house rules.');
reset role;
do $$ begin
  assert (select count(*) from public.reviews where published_at is not null) = 2, 'both published';
  assert (select rating_avg = 4.0 and rating_count = 1 from public.listings where id = '00000000-0000-0000-0000-0000000000d9'), 'room rating';
  assert (select rating_avg = 5.0 from public.profiles where id = '00000000-0000-0000-0000-0000000000d2'), 'corper rating';
  assert (select comment from public.listing_reviews('00000000-0000-0000-0000-0000000000d9')) = 'Room was exactly as shown.', 'room page';
  assert (select rating_count from public.find_rooms() where id = '00000000-0000-0000-0000-0000000000d9') = 1, 'search carries the rating';
end $$;

-- After the window: a one-sided review publishes on its own; no new reviews.
update public.bookings set move_in = current_date - 50, move_out = current_date - 20, status = 'moved_out'
where id = '00000000-0000-0000-0000-0000000000ea';
set role authenticated;
select trv.as_user('00000000-0000-0000-0000-0000000000d3');
select trv.expect_error($$ select public.submit_review('00000000-0000-0000-0000-0000000000ea', 2, 2, 2, 2) $$, '%close 14 days later%');
reset role;

-- The team can take a review down; it stops counting.
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000d4', 'team-d4@example.com', '{"first_name":"Team"}');
insert into private.admins (user_id) values ('00000000-0000-0000-0000-0000000000d4');
set role authenticated;
select trv.as_user('00000000-0000-0000-0000-0000000000d4');
select public.admin_remove_review((select id from public.reviews where direction = 'of_host' limit 1), 'test');
reset role;
do $$ begin
  assert (select rating_count from public.listings where id = '00000000-0000-0000-0000-0000000000d9') = 0, 'removed review no longer counts';
end $$;
update public.listings set status = 'archived' where id = '00000000-0000-0000-0000-0000000000d9';
