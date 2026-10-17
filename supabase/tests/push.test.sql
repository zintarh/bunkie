-- Phone notifications: own devices only, a push job next to every alert (WhatsApp off or on),
-- chat pushes skipped once read, offers on a post alert the corper.

create schema tpu;
grant usage on schema tpu to authenticated, service_role, anon;
create function tpu.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
grant execute on all functions in schema tpu to authenticated, service_role, anon;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000008a1', 'corper-8a1@example.com', '{"first_name":"Ada"}'),
  ('00000000-0000-0000-0000-0000000008b1', 'host-8b1@example.com', '{"first_name":"Bola"}');
update public.settings set value = 'false' where key = 'require_verification_to_request';
insert into public.listings (id, host_id, status, area_name, area_lat, area_lng, room_kind, household, rent_monthly, allowed_to_share, published_at, monthly_total)
values ('00000000-0000-0000-0000-0000000008d1', '00000000-0000-0000-0000-0000000008b1', 'live', 'Jabi', 9.07, 7.42, 'own_room', 'mixed', 60000, true, now(), 60000);

set role authenticated;
select tpu.as_user('00000000-0000-0000-0000-0000000008a1');
select public.save_push('https://fcm.googleapis.com/fcm/send/abc', 'p', 'a', 'Android');
select public.save_push('https://fcm.googleapis.com/fcm/send/abc', 'p2', 'a2', 'Android');
do $$ begin assert (select count(*) from public.push_subscriptions) = 1, 'one row per phone'; end $$;
select public.track('install_shown', '{"reason":"reply"}');
select public.track('anything_else');

-- Someone else can't see it, and signing in on that phone moves it to them.
select tpu.as_user('00000000-0000-0000-0000-0000000008b1');
do $$ begin assert (select count(*) from public.push_subscriptions) = 0, 'not visible to others'; end $$;
select public.drop_push('https://fcm.googleapis.com/fcm/send/abc');
reset role;
do $$ begin
  assert (select count(*) from public.push_subscriptions where user_id = '00000000-0000-0000-0000-0000000008a1') = 1, 'others can''t remove it';
  assert (select count(*) from private.app_events where user_id = '00000000-0000-0000-0000-0000000008a1') = 1, 'only known events are kept';
end $$;

-- Ada posts what she needs; Bola offers his room. Ada gets a push (WhatsApp is off).
set role authenticated;
select tpu.as_user('00000000-0000-0000-0000-0000000008a1');
select public.post_want('Jabi', 9.07, 7.42, null, 80000, null, 3, null, null, 'mixed_ok', null);
select tpu.as_user('00000000-0000-0000-0000-0000000008b1');
select public.offer_room((select id from public.want_feed() where first_name = 'Ada' limit 1), '00000000-0000-0000-0000-0000000008d1');
reset role;
do $$ begin
  assert exists (select 1 from private.jobs where queue = 'push' and payload ->> 'template' = 'want_offer'
                 and payload ->> 'user_id' = '00000000-0000-0000-0000-0000000008a1'), 'offer push queued';
  assert not exists (select 1 from private.jobs where queue = 'whatsapp' and payload ->> 'template' = 'want_offer'), 'no WhatsApp while off';
end $$;

-- Bola writes in the chat: a push now (WhatsApp would wait). Once Ada reads it, the push is skipped.
set role authenticated;
select tpu.as_user('00000000-0000-0000-0000-0000000008b1');
create temp table m as select (public.send_message(
  (select id from public.conversations where tenant_id = '00000000-0000-0000-0000-0000000008a1'), gen_random_uuid(), 'Come see it Saturday')).id as id;
grant select on m to authenticated;
reset role;
do $$ declare j record; r record; begin
  select * into j from private.jobs where queue = 'push' and payload ->> 'template' = 'new_message' and (payload ->> 'message_id')::bigint = (select id from m);
  assert j.run_after <= now(), 'chat push goes now';
  select * into r from public.sys_push_job(j.payload);
  assert r.other_name = 'Bola', format('push names the sender %s', r);
  update public.conversation_members set last_read_id = (select id from m) where user_id = '00000000-0000-0000-0000-0000000008a1';
  assert not exists (select 1 from public.sys_push_job(j.payload)), 'read: no push';
end $$;

update public.listings set status = 'archived' where id = '00000000-0000-0000-0000-0000000008d1';
