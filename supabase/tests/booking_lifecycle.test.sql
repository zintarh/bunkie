-- End-to-end booking rules: request, queue, viewing, agreement, payment, check-in, payout, expiry,
-- plus the access rules around them. Runs as the real API roles via set role + a fake JWT subject.

create schema t;
grant usage on schema t to anon, authenticated, service_role;

create function t.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;

-- Runs p_sql as the current role and checks it fails with a message matching p_like.
create function t.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then raise exception 'expected failure (%), but it worked: %', p_like, p_sql using errcode = 'XX999'; end if;
  if v_msg not ilike p_like then raise exception 'expected %, got: %', p_like, v_msg using errcode = 'XX999'; end if;
end $$;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- People: host Tolu (f), tenants Adaeze (f), Emeka (m), Bisi (f), Ngozi (f)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'tolu@example.com', '{"first_name":"Tolu"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'adaeze@example.com', '{"first_name":"Adaeze"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'emeka@example.com', '{"first_name":"Emeka"}'),
  ('00000000-0000-0000-0000-0000000000b3', 'bisi@example.com', '{"first_name":"Bisi"}'),
  ('00000000-0000-0000-0000-0000000000b4', 'ngozi@example.com', '{"first_name":"Ngozi"}');

-- Verification outcomes arrive through the service role.
set role service_role;
select public.sys_record_verification(u, k, true, 'test', 'ref', 'T***', g)
from (values
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'female'::public.gender),
  ('00000000-0000-0000-0000-0000000000b1', 'female'),
  ('00000000-0000-0000-0000-0000000000b2', 'male'),
  ('00000000-0000-0000-0000-0000000000b3', 'female'),
  ('00000000-0000-0000-0000-0000000000b4', 'female')) p(u, g)
cross join unnest(array['phone', 'nin', 'liveness', 'call_up']) k;
reset role;

do $$ begin
  assert (select count(*) from public.profiles where is_verified) = 5, 'tenants verified';
  assert (select gender from public.profile_private where user_id = '00000000-0000-0000-0000-0000000000b2') = 'male', 'gender from NIN';
end $$;

-- ---------------------------------------------------------------------------
-- Host lists a room
-- ---------------------------------------------------------------------------
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');
create temp table ids as select public.start_listing() as listing_id;
grant select on ids to anon, authenticated, service_role;

-- Status can't be set directly.
select t.expect_error($$ update public.listings set status = 'live' where id = (select listing_id from ids) $$, '%permission denied%');

update public.listings set area_name = 'Wuse 2', room_kind = 'own_room', bath_kind = 'shared', furnished = true,
  household = 'women', open_to_camp = true, min_months = 1, max_months = 6, available_from = current_date,
  rent_monthly = 45000, deposit = 20000, allowed_to_share = true
where id = (select listing_id from ids);
insert into public.listing_locations (listing_id, address_line, lat, lng)
select listing_id, '12 Aminu Kano Crescent', 9.0790, 7.4700 from ids;
insert into public.listing_costs (listing_id, name, amount, tenant_pays, varies)
select listing_id, n, a, tp, v from ids, (values ('Light', 6000, true, true), ('Water', 0, false, false), ('Wi-Fi', 2000, true, false)) c(n, a, tp, v);
insert into public.listing_photos (listing_id, path, shot, position, taken_at, taken_lat, taken_lng)
select listing_id, listing_id || '/' || s || '.webp', s::public.photo_shot, i, now(), 9.0791, 7.4701
from ids, unnest(array['bedroom', 'bathroom', 'kitchen', 'meter', 'entrance']) with ordinality as x(s, i);
insert into public.bunkie_answers (user_id, sleep, guests, cooking, cleaning, noise, pledged_at, approved_at)
values (auth.uid(), 1, 1, 1, 0, 0, now(), now());

-- No house rules blocks publishing.
select t.expect_error($$ select public.publish_listing((select listing_id from ids)) $$, '%rules%');
insert into public.house_rules (listing_id, topic, choice, consequence, is_custom, position)
select listing_id, 'Noise', 'Quiet after 10pm', 'warning_then_notice', false, 0 from ids;

-- Missing payout account blocks publishing.
select t.expect_error($$ select public.publish_listing((select listing_id from ids)) $$, '%payout%');
reset role;
insert into public.host_payout_accounts (host_id, bank_code, bank_name, account_last4, account_name, recipient_code, name_matches_nin)
values ('00000000-0000-0000-0000-0000000000a1', '058', 'GTBank', '1234', 'TOLU ADE', 'ACCT_test', true);
set role authenticated;
select public.publish_listing((select listing_id from ids));
reset role;

do $$ declare l public.listings; begin
  select * into l from public.listings where id = (select listing_id from ids);
  assert l.status = 'live', 'published';
  assert l.monthly_total = 53000, format('monthly total 45000+6000+2000, got %s', l.monthly_total);
  assert l.total_varies, 'light varies';
  assert l.photo_count = 5 and l.cover_path like '%bedroom%', 'photos counted, bedroom cover';
  assert (select count(*) from private.jobs where queue = 'commute') = 1, 'commute job queued';
end $$;

-- Anonymous search finds it; the exact address isn't readable.
set role anon;
do $$ begin
  assert (select count(*) from public.search_rooms(p_mode => 'camp', p_move_in => current_date + 2)) = 1, 'camp search';
  assert (select count(*) from public.search_rooms(p_pref => 'men_only')) = 0, 'men only excludes women household';
  assert (select commute_min from public.search_rooms(p_mode => 'ppa', p_zone => 4::smallint)) <= 10, 'near Wuse 2';
end $$;
select t.expect_error($$ select * from public.listing_locations $$, '%permission denied%');
select t.expect_error($$ select public.request_room((select listing_id from ids), current_date + 1, 2) $$, '%permission denied%');
reset role;

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000b2');   -- Emeka, male
select t.expect_error($$ select public.request_room((select listing_id from ids), current_date + 1, 2) $$, '%different household%');

select t.as_user('00000000-0000-0000-0000-0000000000a1');   -- host can't request own room
select t.expect_error($$ select public.request_room((select listing_id from ids), current_date + 1, 2) $$, '%own room%');

select t.as_user('00000000-0000-0000-0000-0000000000b1');   -- Adaeze
select t.expect_error($$ select public.request_room((select listing_id from ids), current_date + 1, 9) $$, '%1 to 6 months%');
create temp table b1 as select (public.request_room((select listing_id from ids), current_date + 1, 2)).id;
grant select on b1 to authenticated, service_role;
select t.expect_error($$ select public.request_room((select listing_id from ids), current_date + 1, 2) $$, '%already have a request%');
-- No direct writes to bookings.
select t.expect_error($$ update public.bookings set status = 'paid' $$, '%permission denied%');

select t.as_user('00000000-0000-0000-0000-0000000000b3');   -- Bisi, same dates
create temp table b3 as select (public.request_room((select listing_id from ids), current_date + 1, 2)).id;
grant select on b3 to authenticated, service_role;
-- Bisi can't see Adaeze's booking.
do $$ begin assert (select count(*) from public.bookings) = 1, 'sees only own booking'; end $$;

-- Host accepts Adaeze; Bisi now waits without a clock; a second acceptance is refused.
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select public.booking_action((select id from b1), 'accept', null,
  jsonb_build_object('slots', jsonb_build_array(now() + interval '10 minutes', now() + interval '1 day')));
select t.expect_error($$ select public.booking_action((select id from b3), 'accept', null,
  jsonb_build_object('slots', jsonb_build_array(now() + interval '1 day'))) $$, '%already going ahead%');
reset role;
do $$ begin
  assert (select deadline_at from public.bookings where id = (select id from b3)) is null, 'waiting request has no clock';
end $$;

-- ---------------------------------------------------------------------------
-- Viewing, agreement, payment
-- ---------------------------------------------------------------------------
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000b1');
select t.expect_error($$ select public.booking_action((select id from b1), 'book_viewing', null,
  jsonb_build_object('at', now() + interval '3 days')) $$, '%offered times%');
select public.booking_action((select id from b1), 'book_viewing', null,
  jsonb_build_object('at', (select offered_slots[1] from public.bookings where id = (select id from b1)), 'mode', 'in_person'));
do $$ begin assert (select count(*) from public.room_address((select id from b1))) = 1, 'address unlocked after booking a viewing'; end $$;
-- Stale version is refused.
select t.expect_error($$ select public.booking_action((select id from b1), 'viewing_done', 1) $$, '%just changed%');
select public.booking_action((select id from b1), 'viewing_done');
select public.booking_action((select id from b1), 'matched');

select t.as_user('00000000-0000-0000-0000-0000000000a1');
select public.booking_action((select id from b1), 'confirm_terms');

select t.as_user('00000000-0000-0000-0000-0000000000b1');
select t.expect_error($$ select public.booking_action((select id from b1), 'confirm_terms', null, '{"terms_hash":"nope"}') $$, '%terms changed%');
select public.booking_action((select id from b1), 'confirm_terms', null,
  jsonb_build_object('terms_hash', (select terms_hash from public.agreement_versions where booking_id = (select id from b1))));
create temp table pay as select * from public.start_payment((select id from b1));
grant select on pay to service_role;
-- Double tap reuses the same payment.
do $$ begin assert (select paystack_reference from public.start_payment((select id from b1))) = (select paystack_reference from pay), 'payment reused'; end $$;
select t.expect_error($$ select public.sys_mark_paid('x', 1, '{}') $$, '%permission denied%');
reset role;

do $$ declare p record; begin
  select * into p from pay;
  -- Monthly: first month 53,000 + deposit 20,000 = 73,000 naira.
  assert p.amount_kobo = 7300000, format('amount %s', p.amount_kobo);
  assert p.paystack_fee_kobo between 120000 and 125000, format('paystack fee about 1.5%% + 100, got %s', p.paystack_fee_kobo);
  assert p.bunkie_fee_kobo = 146000, '2% fee';
end $$;

set role service_role;
select public.sys_mark_paid((select paystack_reference from pay), (select amount_kobo + paystack_fee_kobo from pay), '{}');
select public.sys_mark_paid((select paystack_reference from pay), (select amount_kobo + paystack_fee_kobo from pay), '{}');  -- repeat webhook
reset role;

do $$ begin
  assert (select status from public.bookings where id = (select id from b1)) = 'paid', 'paid';
  assert (select status from public.bookings where id = (select id from b3)) = 'closed', 'overlapping request closed';
  assert (select close_reason from public.bookings where id = (select id from b3)) = 'room_taken', 'reason room_taken';
  assert (select count(*) from public.booking_events where booking_id = (select id from b1) and action = 'paid') = 1, 'paid once';
end $$;

-- ---------------------------------------------------------------------------
-- Move-in and payout
-- ---------------------------------------------------------------------------
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000b1');
select t.expect_error($$ select public.booking_action((select id from b1), 'plan_arrival', null, '{"window": "midnight"}') $$, '%arrival_window%');
select public.booking_action((select id from b1), 'plan_arrival', null, '{"window": "midday"}');
select public.booking_action((select id from b1), 'check_in', null, '{"as_listed": true}');
reset role;
do $$ begin
  assert (select status from public.bookings where id = (select id from b1)) = 'moved_in', 'moved in';
  assert (select amount_kobo from public.payouts where booking_id = (select id from b1)) = 7300000 - 146000, 'host gets 98%';
  assert (select count(*) from private.jobs where queue = 'payout') = 1, 'payout job';
end $$;

update public.bookings set deadline_at = now() - interval '1 minute' where id = (select id from b1);
set role service_role;
select public.sys_expire_overdue(100);
reset role;
do $$ begin assert (select status from public.bookings where id = (select id from b1)) = 'active', 'auto-confirmed move-in'; end $$;

-- ---------------------------------------------------------------------------
-- Expiry, limits, host cancel with refund
-- ---------------------------------------------------------------------------
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000b4');   -- Ngozi asks for dates after Adaeze's stay
create temp table b4 as select (public.request_room((select listing_id from ids), current_date + 90, 1)).id;
grant select on b4 to authenticated, service_role;
reset role;
update public.bookings set deadline_at = now() - interval '1 minute' where id = (select id from b4);
set role service_role;
select public.sys_expire_overdue(100);
reset role;
do $$ begin
  assert (select close_reason from public.bookings where id = (select id from b4)) = 'host_no_reply', 'expired';
  assert exists (select 1 from private.jobs where payload ->> 'template' = 'booking_closed'
                 and payload ->> 'user_id' = '00000000-0000-0000-0000-0000000000b4'), 'tenant told';
end $$;

update public.settings set value = '1' where key = 'max_open_requests';
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000b4');
select public.request_room((select listing_id from ids), current_date + 90, 1);
select t.expect_error($$ select public.request_room((select listing_id from ids), current_date + 120, 1) $$, '%1 open requests%');
reset role;
update public.settings set value = '3' where key = 'max_open_requests';

-- Ngozi gets to paid, then the host cancels: full refund and lower standing.
set role authenticated;
create temp table b5 as select id from public.bookings where tenant_id = '00000000-0000-0000-0000-0000000000b4' and status = 'requested';
grant select on b5 to authenticated, service_role;
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select public.booking_action((select id from b5), 'accept', null, jsonb_build_object('slots', jsonb_build_array(now() + interval '5 minutes')));
select t.as_user('00000000-0000-0000-0000-0000000000b4');
select public.booking_action((select id from b5), 'book_viewing', null,
  jsonb_build_object('at', (select offered_slots[1] from public.bookings where id = (select id from b5)), 'mode', 'video_call'));
select public.booking_action((select id from b5), 'viewing_done');
select public.booking_action((select id from b5), 'matched');
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select public.booking_action((select id from b5), 'confirm_terms');
select t.as_user('00000000-0000-0000-0000-0000000000b4');
select public.booking_action((select id from b5), 'confirm_terms', null,
  jsonb_build_object('terms_hash', (select terms_hash from public.agreement_versions where booking_id = (select id from b5))));
create temp table pay5 as select * from public.start_payment((select id from b5));
grant select on pay5 to service_role;
reset role;
set role service_role;
select public.sys_mark_paid((select paystack_reference from pay5), (select amount_kobo + paystack_fee_kobo from pay5), '{}');
reset role;
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select public.booking_action((select id from b5), 'host_cancel');
reset role;
do $$ begin
  assert (select status from public.bookings where id = (select id from b5)) = 'closed', 'cancelled';
  assert (select amount_kobo from public.refunds where booking_id = (select id from b5))
       = (select amount_kobo + paystack_fee_kobo from pay5), 'full refund including fee';
  assert (select standing from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 75, 'host standing lowered';
end $$;

-- Overlapping paid stays are impossible even when written directly.
do $$ begin
  begin
    insert into public.bookings (listing_id, tenant_id, host_id, status, move_in, months, move_out, monthly_total)
    values ((select listing_id from ids), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1',
            'paid', current_date + 5, 1, current_date + 35, 53000);
    raise exception 'double booking allowed' using errcode = 'XX999';
  exception when exclusion_violation then null;
  end;
end $$;

-- Jobs: claim, fail with backoff, finish.
set role service_role;
do $$ declare j record; begin
  select * into j from public.sys_claim_jobs('whatsapp', 1);
  assert j.id is not null, 'claimed';
  perform public.sys_finish_job(j.id, 'timeout');
  assert not exists (select 1 from public.sys_claim_jobs('whatsapp', 1000) c where c.id = j.id), 'not reclaimed during backoff';
end $$;
reset role;
do $$ begin
  assert (select run_after > now() from private.jobs where last_error = 'timeout'), 'failed job backs off';
end $$;
