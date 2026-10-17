-- Phone notifications (Web Push). Every alert that already queues a WhatsApp job (requests, viewings,
-- payments, move-in, chat) now also queues a 'push' job, which runs even while WhatsApp is off.
-- The worker sends it to each phone the person turned notifications on for.
--  * Chat: sent straight away (the phone hides it if that chat is open); WhatsApp still waits 10 minutes.
--  * Quiet hours 10pm–7am Lagos: held until 7am, except payment alerts. Done in the worker.
--  * The worker runs from GitHub Actions every 5 minutes, and right away when someone does
--    something that alerts the other person (the app calls push-now).

alter table private.jobs drop constraint jobs_queue_check;
alter table private.jobs add constraint jobs_queue_check
  check (queue in ('whatsapp', 'email', 'payout', 'refund', 'commute', 'verification', 'push'));

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
create policy "own devices" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));

-- This phone: turn notifications on (or move them to whoever is signed in now).
create or replace function public.save_push(p_endpoint text, p_p256dh text, p_auth text, p_device text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then perform private.fail('auth', 'Sign in first.'); end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_device, 120))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    device = excluded.device, created_at = now();
  -- Ten phones is plenty; drop the oldest.
  delete from public.push_subscriptions where id in (
    select id from public.push_subscriptions where user_id = auth.uid() order by created_at desc offset 10);
end $$;

create or replace function public.drop_push(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

-- Queue a push next to every WhatsApp alert (whether or not WhatsApp is on).
create or replace function private.enqueue(p_queue text, p_payload jsonb, p_run_after timestamptz default now())
returns void language sql security definer set search_path = '' as $$
  insert into private.jobs (queue, payload, run_after)
  select p_queue, p_payload, p_run_after
  where p_queue <> 'whatsapp' or private.setting_bool('whatsapp_enabled', false)
  union all
  select 'push', p_payload, case when p_payload ->> 'template' = 'new_message' then now() else p_run_after end
  where p_queue = 'whatsapp' and private.setting_bool('push_enabled', true)
$$;

-- A host offered a room on your post.
create or replace function private.notify_want_offer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.enqueue('whatsapp', jsonb_build_object(
    'user_id', (select author_id from public.room_wants where id = new.want_id), 'template', 'want_offer',
    'conversation_id', new.conversation_id, 'host_id', new.host_id));
  return null;
end $$;
create trigger notify_want_offer after insert on public.want_offers
  for each row execute function private.notify_want_offer();

-- For the worker: what a push says and where it opens. Null means don't send (read, muted, gone).
create or replace function public.sys_push_job(p_payload jsonb)
returns table (other_name text, conversation_id uuid, booking_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (p_payload ->> 'user_id')::uuid;
  v_conv uuid := (p_payload ->> 'conversation_id')::uuid;
  v_booking uuid := (p_payload ->> 'booking_id')::uuid;
  v_other uuid;
begin
  if p_payload ->> 'template' = 'new_message' and not exists (
    select 1 from public.conversation_members m
    where m.conversation_id = v_conv and m.user_id = v_user and not m.muted and m.last_read_id < (p_payload ->> 'message_id')::bigint
  ) then
    return;
  end if;
  if v_conv is not null then
    select case when c.tenant_id = v_user then c.host_id else c.tenant_id end into v_other from public.conversations c where c.id = v_conv;
  elsif v_booking is not null then
    select case when b.tenant_id = v_user then b.host_id else b.tenant_id end into v_other from public.bookings b where b.id = v_booking;
  end if;
  return query select coalesce((select p.first_name from public.profiles p where p.id = v_other), ''), v_conv, v_booking;
end $$;

create or replace function public.sys_push_sent(p_endpoints text[], p_gone text[]) returns void
language sql security definer set search_path = '' as $$
  update public.push_subscriptions set last_sent_at = now() where endpoint = any(p_endpoints);
  delete from public.push_subscriptions where endpoint = any(p_gone);
$$;

-- Hold a job until later without counting it as a failed try (quiet hours).
create or replace function public.sys_defer_job(p_id bigint, p_until timestamptz) returns void
language sql security definer set search_path = '' as $$
  update private.jobs set run_after = p_until, locked_until = null, attempts = greatest(attempts - 1, 0) where id = p_id
$$;

-- Install and notification prompts: shown / installed / dismissed counts, for the admin.
create table private.app_events (
  id bigint generated always as identity primary key,
  name text not null,
  user_id uuid,
  meta jsonb not null default '{}',
  at timestamptz not null default now()
);
create index app_events_name_idx on private.app_events (name, at desc);

create or replace function public.track(p_name text, p_meta jsonb default '{}') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_name not in ('install_shown', 'install_accepted', 'install_dismissed', 'installed', 'opened_installed',
                    'push_shown', 'push_granted', 'push_denied', 'push_dismissed') then
    return;
  end if;
  insert into private.app_events (name, user_id, meta) values (p_name, auth.uid(), coalesce(p_meta, '{}') - 'user_id');
end $$;

create or replace function public.admin_app_events(p_days int default 30)
returns table (name text, total int, people int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query select e.name, count(*)::int, count(distinct e.user_id)::int
  from private.app_events e where e.at > now() - make_interval(days => p_days) group by e.name order by e.name;
end $$;

insert into public.settings (key, value) values ('push_enabled', 'true') on conflict (key) do nothing;

revoke execute on function public.save_push(text, text, text, text), public.drop_push(text), public.admin_app_events(int) from public, anon;
grant execute on function public.save_push(text, text, text, text), public.drop_push(text), public.admin_app_events(int) to authenticated;
revoke execute on function public.track(text, jsonb) from public;
grant execute on function public.track(text, jsonb) to anon, authenticated;
revoke execute on function public.sys_push_job(jsonb), public.sys_push_sent(text[], text[]), public.sys_defer_job(bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sys_push_job(jsonb), public.sys_push_sent(text[], text[]), public.sys_defer_job(bigint, timestamptz)
  to service_role;
