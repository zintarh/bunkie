-- Admin tools: only admins get in, every action is logged, suspensions stop people, reviews resolve things.

create schema tad;
grant usage on schema tad to authenticated, service_role, anon;
create function tad.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create function tad.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin execute p_sql; exception when others then v_msg := sqlerrm; end;
  if v_msg is null then raise exception 'expected failure (%), but it worked: %', p_like, p_sql using errcode = 'XX999'; end if;
  if v_msg not ilike p_like then raise exception 'expected %, got: %', p_like, v_msg using errcode = 'XX999'; end if;
end $$;
grant execute on all functions in schema tad to authenticated, service_role, anon;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000ad01', 'admin@example.com', '{"first_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-00000000ad02', 'host-ad2@example.com', '{"first_name":"Hope"}'),
  ('00000000-0000-0000-0000-00000000ad03', 'corper-ad3@example.com', '{"first_name":"Chidi"}');
insert into private.admins (user_id) values ('00000000-0000-0000-0000-00000000ad01');
update public.settings set value = 'false' where key = 'require_verification_to_request';
insert into public.listings (id, host_id, status, area_name, room_kind, household, rent_monthly, allowed_to_share, published_at, monthly_total)
values ('00000000-0000-0000-0000-00000000ad10', '00000000-0000-0000-0000-00000000ad02', 'flagged', 'Garki', 'own_room', 'mixed', 40000, true, now(), 40000);

-- Not an admin: refused.
set role authenticated;
select tad.as_user('00000000-0000-0000-0000-00000000ad03');
select tad.expect_error($$ select public.admin_overview() $$, '%not allowed%');
do $$ begin assert not public.am_admin(), 'corper is not admin'; end $$;

-- Admin: overview counts the flagged listing; approving it puts it live and logs it.
select tad.as_user('00000000-0000-0000-0000-00000000ad01');
do $$ begin
  assert public.am_admin(), 'admin';
  assert (public.admin_overview() ->> 'listings')::int >= 1, 'flagged listing counted';
end $$;
select public.admin_listing_decision('00000000-0000-0000-0000-00000000ad10', 'approve');
reset role;
do $$ begin
  assert (select status from public.listings where id = '00000000-0000-0000-0000-00000000ad10') = 'live', 'approved';
  assert exists (select 1 from private.admin_actions where action = 'listing_approve'), 'logged';
end $$;

-- A chat with a scam phrase shows up, the admin reads the original and warns.
set role authenticated;
select tad.as_user('00000000-0000-0000-0000-00000000ad03');
create temp table ac as select public.start_conversation('00000000-0000-0000-0000-00000000ad10') as id;
grant select on ac to authenticated;
select public.send_message((select id from ac), gen_random_uuid(), 'pay the inspection fee to my account 0123456789 first');
select tad.as_user('00000000-0000-0000-0000-00000000ad01');
do $$ begin
  assert (select count(*) from public.admin_flagged_chats() where conversation_id = (select id from ac)) = 1, 'flagged chat listed';
  assert (select original from public.admin_chat((select id from ac)) where original is not null limit 1) like '%0123456789%', 'admin sees the original';
end $$;
select public.admin_review_chat((select id from ac), 'warned');
do $$ begin
  assert (select count(*) from public.admin_flagged_chats() where conversation_id = (select id from ac)) = 0, 'reviewed';
end $$;

-- Suspension: the corper can't message or request; the host's rooms leave search.
select public.admin_suspend('00000000-0000-0000-0000-00000000ad03', true, 'off-platform payment');
select tad.as_user('00000000-0000-0000-0000-00000000ad03');
select tad.expect_error($$ select public.send_message((select id from ac), gen_random_uuid(), 'hello') $$, '%on hold%');
select tad.expect_error($$ select public.request_room('00000000-0000-0000-0000-00000000ad10', current_date + 5, 1) $$, '%on hold%');
select tad.as_user('00000000-0000-0000-0000-00000000ad01');
select public.admin_suspend('00000000-0000-0000-0000-00000000ad03', false);
select public.admin_suspend('00000000-0000-0000-0000-00000000ad02', true, 'test');
do $$ begin
  assert not exists (select 1 from public.find_rooms() where id = '00000000-0000-0000-0000-00000000ad10'), 'suspended host hidden';
end $$;
select public.admin_suspend('00000000-0000-0000-0000-00000000ad02', false);
select tad.expect_error($$ select public.admin_suspend('00000000-0000-0000-0000-00000000ad01', true) $$, '%yourself%');

-- A report on a paid booking: refund gives the money back and closes the booking.
select tad.as_user('00000000-0000-0000-0000-00000000ad03');
create temp table ab as select (public.request_room('00000000-0000-0000-0000-00000000ad10', current_date + 5, 1)).id;
grant select on ab to authenticated, service_role;
reset role;
insert into public.payments (booking_id, payer_id, kind, amount_kobo, paystack_reference, status, paid_at)
values ((select id from ab), '00000000-0000-0000-0000-00000000ad03', 'booking', 4000000, 'ref_admin_test', 'success', now());
insert into public.reports (reporter_id, booking_id, kind, details)
values ('00000000-0000-0000-0000-00000000ad03', (select id from ab), 'not_as_listed', 'No water');
set role authenticated;
select tad.as_user('00000000-0000-0000-0000-00000000ad01');
do $$ begin
  assert (select count(*) from public.admin_reports() where booking_id = (select id from ab)) = 1, 'report listed';
end $$;
select public.admin_resolve_report((select r.id from public.admin_reports() r where r.booking_id = (select id from ab)), 'refund', 'confirmed with photos');
reset role;
do $$ begin
  assert (select count(*) from public.refunds where booking_id = (select id from ab)) = 1, 'refunded';
  assert (select status from public.bookings where id = (select id from ab)) = 'closed', 'booking closed';
  assert (select status from public.reports where booking_id = (select id from ab)) = 'closed', 'report closed';
  assert (select count(*) from private.admin_actions) >= 6, 'every action logged';
end $$;

-- Manual document review records a verification like a provider would.
set role authenticated;
select tad.as_user('00000000-0000-0000-0000-00000000ad01');
select public.admin_set_verification('00000000-0000-0000-0000-00000000ad02', 'discharge', true, 'certificate looks right');
reset role;
do $$ begin
  assert exists (select 1 from private.verifications where user_id = '00000000-0000-0000-0000-00000000ad02'
                 and kind = 'discharge' and status = 'passed' and provider = 'admin'), 'manual review recorded';
end $$;

-- Leave the shared test database as found for the tests that run after this one.
update public.listings set status = 'archived' where id = '00000000-0000-0000-0000-00000000ad10';

-- Sending a listing back: it returns to the host as a draft with the note; republishing goes back to review.
update public.listings set status = 'in_review' where id = '00000000-0000-0000-0000-00000000ad10';
set role authenticated;
select tad.as_user('00000000-0000-0000-0000-00000000ad01');
select tad.expect_error($$ select public.admin_listing_decision('00000000-0000-0000-0000-00000000ad10', 'changes', '') $$, '%should change%');
select public.admin_listing_decision('00000000-0000-0000-0000-00000000ad10', 'changes', 'Add a clear bathroom photo');
reset role;
do $$ begin
  assert (select status = 'draft' and review_note = 'Add a clear bathroom photo' from public.listings
          where id = '00000000-0000-0000-0000-00000000ad10'), 'back to the host with a note';
end $$;
update public.listings set status = 'archived' where id = '00000000-0000-0000-0000-00000000ad10';
