-- Chat: contact hiding, scam flags, retries, blocks, limits, unread counts and booking steps in the chat.

create schema tch;
grant usage on schema tch to authenticated, service_role, anon;
create function tch.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create function tch.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin execute p_sql; exception when others then v_msg := sqlerrm; end;
  if v_msg is null then raise exception 'expected failure (%), but it worked: %', p_like, p_sql using errcode = 'XX999'; end if;
  if v_msg not ilike p_like then raise exception 'expected %, got: %', p_like, v_msg using errcode = 'XX999'; end if;
end $$;
grant execute on all functions in schema tch to authenticated, service_role, anon;

-- Redaction: off-platform contact details disappear, ordinary text stays.
do $$
declare r text;
begin
  r := private.redact_contacts('Call me on 0803 123 4567 or +234 803 123 4567');
  assert r !~ '[0-9]{3}', format('phones redacted: %s', r);
  r := private.redact_contacts('my number is o8o3.123.4567');
  assert r !~ '123', format('dotted phone with letter O redacted: %s', r);
  r := private.redact_contacts('send it to 0123456789 GTBank');
  assert r !~ '0123' and r !~* 'gtbank', format('account and bank redacted: %s', r);
  r := private.redact_contacts('zero eight zero three one two three');
  assert r !~* 'eight', format('spelled digits redacted: %s', r);
  r := private.redact_contacts('add me on WhatsApp or ig @tolu_abj, mail tolu@gmail.com, wa.me/2348031234567');
  assert r !~* 'whatsapp|tolu|gmail|wa\.me', format('apps, handles, email, links redacted: %s', r);
  r := private.redact_contacts('Rent is ₦150,000 and I can view on 20/10/2026 at 2pm. Network signal is bad in Imo.');
  assert r = 'Rent is ₦150,000 and I can view on 20/10/2026 at 2pm. Network signal is bad in Imo.', format('normal text kept: %s', r);
end $$;

do $$ begin
  assert private.scam_phrase('Please pay the inspection fee to my account first'), 'inspection fee scam';
  assert private.scam_phrase('just transfer to my opay, no need for the app'), 'pay to my wallet';
  assert private.scam_phrase('lets do it outside bunkie to avoid the fee'), 'off platform';
  assert not private.scam_phrase('Is the inspection free? I can come Saturday.'), 'normal question';
end $$;

-- People and a live room.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'host-e1@example.com', '{"first_name":"Efe"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'corper-e2@example.com', '{"first_name":"Ada"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'stranger-e3@example.com', '{"first_name":"Sam"}');
insert into public.listings (id, host_id, status, area_name, room_kind, household, rent_monthly, allowed_to_share, published_at)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'live', 'Utako', 'own_room', 'mixed', 60000, true, now());
update public.settings set value = 'false' where key = 'require_verification_to_request';

set role authenticated;
select tch.as_user('00000000-0000-0000-0000-0000000000e2');
create temp table conv as select public.start_conversation('00000000-0000-0000-0000-0000000000f1') as id;
grant select on conv to authenticated, service_role;
do $$ begin
  assert (select public.start_conversation('00000000-0000-0000-0000-0000000000f1')) = (select id from conv), 'same chat on second tap';
end $$;
select tch.as_user('00000000-0000-0000-0000-0000000000e1');
select tch.expect_error($$ select public.start_conversation('00000000-0000-0000-0000-0000000000f1') $$, '%own room%');
select tch.as_user('00000000-0000-0000-0000-0000000000e2');

-- Sending: redacted before payment, original kept privately, retry returns the same message.
select public.send_message((select id from conv), '11111111-1111-4111-8111-111111111111', 'Hi! Text me on 08031234567');
do $$ declare m public.messages; begin
  select * into m from public.messages where client_id = '11111111-1111-4111-8111-111111111111';
  assert m.redacted and m.body !~ '0803', format('redacted: %s', m.body);
  assert (select count(*) from public.messages where client_id = '11111111-1111-4111-8111-111111111111') = 1, 'one copy';
end $$;
select public.send_message((select id from conv), '11111111-1111-4111-8111-111111111111', 'Hi! Text me on 08031234567');
do $$ begin
  assert (select count(*) from public.messages where sender_id = '00000000-0000-0000-0000-0000000000e2') = 1, 'retry is not a second message';
end $$;
-- Corpers can't read the private original or flags, or write messages directly.
select tch.expect_error($$ select * from private.message_originals $$, '%permission denied%');
select tch.expect_error($$ insert into public.messages (conversation_id, kind, body) values ((select id from conv), 'text', 'x') $$, '%permission denied%');

-- Scam phrase: flagged, and a safety note appears once.
select public.send_message((select id from conv), gen_random_uuid(), 'Can I pay the inspection fee to your account first?');
select public.send_message((select id from conv), gen_random_uuid(), 'Or pay you directly in cash?');
do $$ begin
  assert (select flagged from public.conversations where id = (select id from conv)), 'chat flagged';
  assert (select count(*) from public.messages where conversation_id = (select id from conv) and meta ->> 'type' = 'pay_safety') = 1, 'one safety note';
end $$;

-- A stranger can't read or write this chat.
select tch.as_user('00000000-0000-0000-0000-0000000000e3');
do $$ begin
  assert (select count(*) from public.messages where conversation_id = (select id from conv)) = 0, 'stranger sees nothing';
end $$;
select tch.expect_error($$ select public.send_message((select id from conv), gen_random_uuid(), 'hello') $$, '%not found%');

-- Host's inbox: unread count, then reading clears it.
select tch.as_user('00000000-0000-0000-0000-0000000000e1');
do $$ declare r record; begin
  select * into r from public.my_conversations();
  assert r.other_name = 'Ada' and r.unread = 4, format('unread for host, got %s', r.unread);
  assert public.unread_chats() = 1, 'one chat unread';
end $$;
select public.mark_read((select id from conv), (select max(id) from public.messages where conversation_id = (select id from conv)));
do $$ begin
  assert (select unread from public.my_conversations()) = 0, 'read';
  assert public.unread_chats() = 0, 'nothing unread';
end $$;

-- Blocking stops messages both ways.
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');
select tch.as_user('00000000-0000-0000-0000-0000000000e2');
select tch.expect_error($$ select public.send_message((select id from conv), gen_random_uuid(), 'hello?') $$, '%can''t message%');
reset role;
delete from public.blocks;

-- Rate limit.
update public.settings set value = '4' where key = 'max_messages_per_minute';
set role authenticated;
select tch.as_user('00000000-0000-0000-0000-0000000000e2');
select public.send_message((select id from conv), gen_random_uuid(), 'one more');
select tch.expect_error($$ select public.send_message((select id from conv), gen_random_uuid(), 'too fast') $$, '%very fast%');
reset role;
update public.settings set value = '20' where key = 'max_messages_per_minute';

-- Booking steps land in the same chat; paying unlocks contact details.
set role authenticated;
select tch.as_user('00000000-0000-0000-0000-0000000000e2');
create temp table bk as select (public.request_room('00000000-0000-0000-0000-0000000000f1', current_date + 3, 1, 'Hi, call 0803 123 4567')).id;
grant select on bk to authenticated, service_role;
reset role;
do $$ begin
  assert (select booking_id from public.conversations where id = (select id from conv)) = (select id from bk), 'booking linked to chat';
  assert exists (select 1 from public.messages where conversation_id = (select id from conv) and kind = 'system' and body = 'Request sent'), 'request in chat';
  assert (select body !~ '0803' from public.messages where conversation_id = (select id from conv) and body like 'Hi, call%'), 'request message redacted';
end $$;
-- Simulate payment: the paid step unlocks contacts.
insert into public.booking_events (booking_id, action, from_status, to_status) values ((select id from bk), 'paid', 'agreed', 'paid');
set role authenticated;
select tch.as_user('00000000-0000-0000-0000-0000000000e2');
select public.send_message((select id from conv), gen_random_uuid(), 'See you! My number is 08031234567');
reset role;
do $$ begin
  assert (select contacts_unlocked from public.conversations where id = (select id from conv)), 'unlocked';
  assert (select body from public.messages where conversation_id = (select id from conv) order by id desc limit 1) like '%08031234567', 'number visible after paying';
end $$;

-- WhatsApp nudge: once while unread, not again within 30 minutes, never after reading.
set role service_role;
do $$ declare v_last bigint; begin
  select max(id) into v_last from public.messages where conversation_id = (select id from conv);
  assert public.sys_chat_should_notify((select id from conv), '00000000-0000-0000-0000-0000000000e1', v_last), 'first nudge';
  assert not public.sys_chat_should_notify((select id from conv), '00000000-0000-0000-0000-0000000000e1', v_last), 'no second nudge';
end $$;
reset role;
