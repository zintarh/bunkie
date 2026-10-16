-- Money through a stay: rent released by period, early-leave refunds, monthly rent, deposit at move-out.

create schema tsm;
grant usage on schema tsm to authenticated, service_role, anon;
create function tsm.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create function tsm.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin execute p_sql; exception when others then v_msg := sqlerrm; end;
  if v_msg is null then raise exception 'expected failure (%), but it worked: %', p_like, p_sql using errcode = 'XX999'; end if;
  if v_msg not ilike p_like then raise exception 'expected %, got: %', p_like, v_msg using errcode = 'XX999'; end if;
end $$;
grant execute on all functions in schema tsm to authenticated, service_role, anon;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000005a1', 'host-5a1@example.com', '{"first_name":"Seyi"}'),
  ('00000000-0000-0000-0000-0000000005b1', 'corper-5b1@example.com', '{"first_name":"Nkem"}'),
  ('00000000-0000-0000-0000-0000000005b2', 'corper-5b2@example.com', '{"first_name":"Ola"}'),
  ('00000000-0000-0000-0000-0000000005ad', 'team-5ad@example.com', '{"first_name":"Team"}');
insert into private.admins (user_id) values ('00000000-0000-0000-0000-0000000005ad');
insert into public.listings (id, host_id, status, area_name, room_kind, household, rent_monthly, deposit, pay_schedule, allowed_to_share, published_at, monthly_total)
values ('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005a1', 'live', 'Apo', 'own_room', 'mixed', 40000, 10000, 'lump_sum', true, now(), 40000),
       ('00000000-0000-0000-0000-0000000005c2', '00000000-0000-0000-0000-0000000005a1', 'live', 'Apo', 'own_room', 'mixed', 40000, 10000, 'monthly', true, now(), 40000);

-- 1. Lump sum, 3 months, paid 120,000 rent + 10,000 deposit; moves in today.
insert into public.bookings (id, listing_id, tenant_id, host_id, status, move_in, months, move_out, monthly_total)
values ('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005b1',
        '00000000-0000-0000-0000-0000000005a1', 'paid', current_date, 3, (current_date + interval '3 months')::date, 40000);
insert into public.payments (booking_id, payer_id, kind, amount_kobo, rent_kobo, deposit_kobo, bunkie_fee_kobo, paystack_reference, status, paid_at)
values ('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000005b1', 'booking', 13000000, 12000000, 1000000, 240000, 'ref_sm1', 'success', now());
update public.bookings set status = 'moved_in' where id = '00000000-0000-0000-0000-0000000005e1';
do $$ begin
  assert (select count(*) from public.payouts where booking_id = '00000000-0000-0000-0000-0000000005e1' and kind = 'rent') = 3, 'three monthly releases';
  assert (select sum(amount_kobo) from public.payouts where booking_id = '00000000-0000-0000-0000-0000000005e1') = 12000000 - 240000, '98% of rent, no deposit';
  assert (select max(release_after) from public.payouts where booking_id = '00000000-0000-0000-0000-0000000005e1') > now() + interval '55 days', 'last month released later';
end $$;

-- Leaves after a month: the two months not yet released come back.
update public.bookings set status = 'active' where id = '00000000-0000-0000-0000-0000000005e1';
set role authenticated;
select tsm.as_user('00000000-0000-0000-0000-0000000005b1');
select public.booking_action('00000000-0000-0000-0000-0000000005e1', 'end_early', null,
  jsonb_build_object('last_night', (current_date + interval '1 month' - interval '1 day')::date));
reset role;
do $$ begin
  assert (select count(*) from public.payouts where booking_id = '00000000-0000-0000-0000-0000000005e1' and status = 'cancelled') = 2, 'two months held back';
  assert (select sum(amount_kobo) from public.refunds where booking_id = '00000000-0000-0000-0000-0000000005e1' and reason = 'left_early') = 8000000, 'two months refunded (80,000)';
end $$;

-- Move-out: host proposes keeping 4,000 of the deposit; corper accepts.
update public.bookings set status = 'moved_out' where id = '00000000-0000-0000-0000-0000000005e1';
set role authenticated;
select tsm.as_user('00000000-0000-0000-0000-0000000005a1');
select tsm.expect_error($$ select public.propose_deposit('00000000-0000-0000-0000-0000000005e1', 20000, 'x') $$, '%more than the deposit%');
select tsm.expect_error($$ select public.propose_deposit('00000000-0000-0000-0000-0000000005e1', 4000, '') $$, '%what the deduction%');
select public.propose_deposit('00000000-0000-0000-0000-0000000005e1', 4000, 'Broken shelf');
select tsm.as_user('00000000-0000-0000-0000-0000000005b1');
select public.respond_deposit('00000000-0000-0000-0000-0000000005e1', true);
reset role;
do $$ begin
  assert (select amount_kobo from public.refunds where booking_id = '00000000-0000-0000-0000-0000000005e1' and reason = 'deposit_return') = 600000, '6,000 back';
  assert (select amount_kobo from public.payouts where booking_id = '00000000-0000-0000-0000-0000000005e1' and kind = 'deposit') = 400000, 'host gets the 4,000 in full';
end $$;

-- 2. Monthly, 3 months: later months are paid in Bunkie and released once they start.
insert into public.bookings (id, listing_id, tenant_id, host_id, status, move_in, months, move_out, monthly_total)
values ('00000000-0000-0000-0000-0000000005e2', '00000000-0000-0000-0000-0000000005c2', '00000000-0000-0000-0000-0000000005b2',
        '00000000-0000-0000-0000-0000000005a1', 'active', current_date - 27, 3, (current_date - 27 + interval '3 months')::date, 40000);
insert into public.payments (booking_id, payer_id, kind, amount_kobo, rent_kobo, deposit_kobo, paystack_reference, status, paid_at)
values ('00000000-0000-0000-0000-0000000005e2', '00000000-0000-0000-0000-0000000005b2', 'booking', 5000000, 4000000, 1000000, 'ref_sm2', 'success', now() - interval '27 days');
set role authenticated;
select tsm.as_user('00000000-0000-0000-0000-0000000005b2');
do $$ declare r record; begin
  select * into r from public.rent_status('00000000-0000-0000-0000-0000000005e2');
  assert r.next_period = (current_date - 27 + interval '1 month')::date and r.amount = 40000, 'month 2 due';
end $$;
create temp table rp as select * from public.start_payment('00000000-0000-0000-0000-0000000005e2');
grant select on rp to service_role;
do $$ begin assert (select kind = 'rent' and amount_kobo = 4000000 from rp), 'rent payment of 40,000'; end $$;
reset role;
set role service_role;
select public.sys_mark_paid((select paystack_reference from rp), (select amount_kobo + paystack_fee_kobo from rp), '{}');
reset role;
do $$ begin
  assert (select count(*) from public.payouts where payment_id = (select id from rp) and kind = 'rent') = 1, 'month 2 released to host';
end $$;
set role authenticated;
select tsm.as_user('00000000-0000-0000-0000-0000000005b2');
do $$ begin
  assert (select next_period from public.rent_status('00000000-0000-0000-0000-0000000005e2')) = (current_date - 27 + interval '2 months')::date, 'month 3 next';
end $$;
select tsm.expect_error($$ select public.start_payment('00000000-0000-0000-0000-0000000005e2') $$, '%opens on%');
reset role;

-- Dispute: the team decides; no proposal at all: full refund when the window closes.
update public.bookings set status = 'moved_out' where id = '00000000-0000-0000-0000-0000000005e2';
set role authenticated;
select tsm.as_user('00000000-0000-0000-0000-0000000005a1');
select public.propose_deposit('00000000-0000-0000-0000-0000000005e2', 10000, 'Repainting');
select tsm.as_user('00000000-0000-0000-0000-0000000005b2');
select public.respond_deposit('00000000-0000-0000-0000-0000000005e2', false, 'The wall was already marked');
select tsm.as_user('00000000-0000-0000-0000-0000000005ad');
select public.admin_settle_deposit('00000000-0000-0000-0000-0000000005e2', 3000, 'photos show old marks');
reset role;
do $$ begin
  assert (select amount_kobo from public.refunds where booking_id = '00000000-0000-0000-0000-0000000005e2' and reason = 'deposit_return') = 700000, 'team split: 7,000 back';
  assert (select status from public.reports where booking_id = '00000000-0000-0000-0000-0000000005e2') = 'closed', 'dispute closed';
end $$;

-- 3. Host proposes nothing: completion refunds the whole deposit.
update public.bookings set status = 'moved_out' where id = '00000000-0000-0000-0000-0000000005e1';
delete from public.deposit_settlements where booking_id = '00000000-0000-0000-0000-0000000005e1';
delete from public.refunds where booking_id = '00000000-0000-0000-0000-0000000005e1' and reason = 'deposit_return';
delete from public.payouts where booking_id = '00000000-0000-0000-0000-0000000005e1' and kind = 'deposit';
update public.bookings set status = 'completed' where id = '00000000-0000-0000-0000-0000000005e1';
do $$ begin
  assert (select amount_kobo from public.refunds where booking_id = '00000000-0000-0000-0000-0000000005e1' and reason = 'deposit_return') = 1000000, 'full deposit back';
end $$;
update public.listings set status = 'archived' where id in ('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005c2');
