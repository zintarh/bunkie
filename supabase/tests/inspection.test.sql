-- Inspections: fee before a paid in-person viewing, one inspection per room at a time, refunds,
-- payout once it happens, and the fee counted toward the first payment.

create schema ti;
grant usage on schema ti to authenticated, service_role, anon;
create function ti.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create function ti.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin execute p_sql; exception when others then v_msg := sqlerrm; end;
  if v_msg is null then raise exception 'expected failure (%), but it worked: %', p_like, p_sql using errcode = 'XX999'; end if;
  if v_msg not ilike p_like then raise exception 'expected %, got: %', p_like, v_msg using errcode = 'XX999'; end if;
end $$;
grant execute on all functions in schema ti to authenticated, service_role, anon;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a9', 'host-a9@example.com', '{"first_name":"Ife"}'),
  ('00000000-0000-0000-0000-0000000000b8', 'corper-b8@example.com', '{"first_name":"Kola"}'),
  ('00000000-0000-0000-0000-0000000000b9', 'corper-b9@example.com', '{"first_name":"Uche"}');
update public.settings set value = 'false' where key = 'require_verification_to_request';
-- Hosts are verified before their rooms show in search.
update public.profiles set is_verified = true where id = '00000000-0000-0000-0000-0000000000a9';
insert into public.listings (id, host_id, status, area_name, room_kind, household, rent_monthly, deposit, allowed_to_share,
                             published_at, inspection_fee, monthly_total)
values ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000a9', 'live', 'Jabi', 'own_room', 'mixed',
        50000, 10000, true, now(), 3000, 50000);

-- The fee can't be over ₦5,000.
do $$ begin
  begin
    update public.listings set inspection_fee = 8000 where id = '00000000-0000-0000-0000-0000000000c9';
    raise exception 'fee cap not enforced' using errcode = 'XX999';
  exception when check_violation then null;
  end;
end $$;

set role authenticated;
select ti.as_user('00000000-0000-0000-0000-0000000000b8');
create temp table k as select (public.request_room('00000000-0000-0000-0000-0000000000c9', current_date + 10, 2)).id;
grant select on k to authenticated, service_role;
select ti.as_user('00000000-0000-0000-0000-0000000000b9');
create temp table u as select (public.request_room('00000000-0000-0000-0000-0000000000c9', current_date + 10, 2)).id;
grant select on u to authenticated, service_role;

-- Host accepts Kola; Kola picks an in-person time: the fee is due before it's confirmed.
select ti.as_user('00000000-0000-0000-0000-0000000000a9');
select public.booking_action((select id from k), 'accept', null, jsonb_build_object('slots', jsonb_build_array(now() + interval '1 day')));
select ti.as_user('00000000-0000-0000-0000-0000000000b8');
select public.booking_action((select id from k), 'book_viewing', null,
  jsonb_build_object('at', (select offered_slots[1] from public.bookings where id = (select id from k)), 'mode', 'in_person'));
do $$ begin
  assert (select status from public.bookings where id = (select id from k)) = 'inspection_due', 'fee due first';
  assert (select inspection_fee from public.bookings where id = (select id from k)) = 3000, 'fee fixed on the booking';
end $$;
create temp table ip as select * from public.start_payment((select id from k));
grant select on ip to service_role;
do $$ begin
  assert (select kind = 'inspection' and amount_kobo = 300000 from ip), 'inspection payment of 3000';
end $$;

-- Uche can't get ahead while Kola is inspecting.
select ti.as_user('00000000-0000-0000-0000-0000000000a9');
select ti.expect_error($$ select public.booking_action((select id from u), 'accept', null,
  jsonb_build_object('slots', jsonb_build_array(now() + interval '1 day'))) $$, '%already going ahead%');
reset role;

-- Paid: viewing confirmed, room on hold.
set role service_role;
select public.sys_mark_paid((select paystack_reference from ip), (select amount_kobo + paystack_fee_kobo from ip), '{}');
reset role;
do $$ begin
  assert (select status from public.bookings where id = (select id from k)) = 'viewing_booked', 'confirmed after paying';
  assert public.listing_hold('00000000-0000-0000-0000-0000000000c9') is not null, 'room shows as being viewed';
  assert (select being_viewed_until is not null from public.find_rooms() where id = '00000000-0000-0000-0000-0000000000c9'), 'search shows the hold';
end $$;

-- The inspection happens: the host's share is scheduled.
update public.bookings set viewing_at = now() - interval '1 minute' where id = (select id from k);
set role authenticated;
select ti.as_user('00000000-0000-0000-0000-0000000000a9');
select public.booking_action((select id from k), 'viewing_done');
reset role;
do $$ begin
  assert (select count(*) from public.payouts where booking_id = (select id from k) and amount_kobo = 300000 - 6000) = 1, 'host paid fee minus 2%';
end $$;

-- They agree: the first payment has the fee taken off (50,000 + 10,000 deposit - 3,000).
set role authenticated;
select ti.as_user('00000000-0000-0000-0000-0000000000b8');
select public.booking_action((select id from k), 'matched');
select public.booking_action((select id from k), 'confirm_terms', null,
  jsonb_build_object('terms_hash', (select terms_hash from public.agreement_versions where booking_id = (select id from k))));
do $$ begin
  assert (select amount_kobo from public.start_payment((select id from k))) = (60000 - 3000) * 100, 'inspection fee credited';
end $$;
reset role;

-- A host who declines after the fee is paid: the corper gets it back.
set role authenticated;
select ti.as_user('00000000-0000-0000-0000-0000000000b8');
select public.booking_action((select id from k), 'withdraw');
reset role;
update public.listings set inspection_fee = 2000 where id = '00000000-0000-0000-0000-0000000000c9';
set role authenticated;
select ti.as_user('00000000-0000-0000-0000-0000000000a9');
select public.booking_action((select id from u), 'accept', null, jsonb_build_object('slots', jsonb_build_array(now() + interval '2 days')));
select ti.as_user('00000000-0000-0000-0000-0000000000b9');
select public.booking_action((select id from u), 'book_viewing', null,
  jsonb_build_object('at', (select offered_slots[1] from public.bookings where id = (select id from u)), 'mode', 'in_person'));
create temp table up as select * from public.start_payment((select id from u));
grant select on up to service_role;
reset role;
set role service_role;
select public.sys_mark_paid((select paystack_reference from up), (select amount_kobo + paystack_fee_kobo from up), '{}');
reset role;
set role authenticated;
select ti.as_user('00000000-0000-0000-0000-0000000000a9');
select public.booking_action((select id from u), 'decline');
reset role;
do $$ begin
  assert (select count(*) from public.refunds where payment_id = (select id from up)) = 1, 'refund when host declines';
  assert (select count(*) from public.payouts where payment_id = (select id from up)) = 0, 'no payout';
end $$;

-- Video viewings stay free.
update public.bookings set status = 'closed' where listing_id = '00000000-0000-0000-0000-0000000000c9';
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000ba', 'corper-ba@example.com', '{"first_name":"Tobi"}');
set role authenticated;
select ti.as_user('00000000-0000-0000-0000-0000000000ba');
create temp table v as select (public.request_room('00000000-0000-0000-0000-0000000000c9', current_date + 12, 1)).id;
grant select on v to authenticated;
select ti.as_user('00000000-0000-0000-0000-0000000000a9');
select public.booking_action((select id from v), 'accept', null, jsonb_build_object('slots', jsonb_build_array(now() + interval '1 day')));
select ti.as_user('00000000-0000-0000-0000-0000000000ba');
select public.booking_action((select id from v), 'book_viewing', null,
  jsonb_build_object('at', (select offered_slots[1] from public.bookings where id = (select id from v)), 'mode', 'video_call'));
do $$ begin
  assert (select status from public.bookings where id = (select id from v)) = 'viewing_booked', 'video viewing needs no fee';
end $$;
reset role;
