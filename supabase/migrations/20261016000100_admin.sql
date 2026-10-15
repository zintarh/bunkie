-- Admin: the team's review tools.
--  * Admins are listed in private.admins and can only be added in SQL (dashboard or migration):
--      insert into private.admins (user_id) select id from auth.users where email = 'you@example.com';
--  * Every admin RPC checks private.is_admin() and writes private.admin_actions (who, what, when).
--  * Suspended people can't request, message, start chats or publish, and their rooms leave search.
--  * Admins can read verification documents (kyc) and chat photos for reviews.

create table private.admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table private.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on private.admin_actions (target_type, target_id);

alter table public.profiles
  add column suspended_at timestamptz,
  add column suspended_reason text;

alter table public.reports add column resolution text, add column resolved_at timestamptz, add column resolved_by uuid;
alter table private.chat_flags add column outcome text;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admins where user_id = auth.uid())
$$;

create or replace function public.am_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_admin() $$;

create or replace function private.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then perform private.fail('forbidden', 'Not allowed.'); end if;
  return auth.uid();
end $$;

create or replace function private.audit(p_action text, p_type text, p_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into private.admin_actions (admin_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_type, p_id, coalesce(p_details, '{}'))
$$;

create or replace function private.assert_active(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where id = p_user and suspended_at is not null) then
    perform private.fail('suspended', 'Your account is on hold. Contact Bunkie support.');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Overview
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'reports', (select count(*) from public.reports where status <> 'closed'),
    'chats', (select count(distinct conversation_id) from private.chat_flags where reviewed_at is null),
    'listings', (select count(*) from public.listings where status = 'flagged'),
    'verifications', (select count(*) from private.verifications where status = 'failed' and created_at > now() - interval '30 days'),
    'suspended', (select count(*) from public.profiles where suspended_at is not null),
    'live_listings', (select count(*) from public.listings where status = 'live'),
    'open_bookings', (select count(*) from public.bookings where status not in ('closed', 'completed')),
    'people', (select count(*) from public.profiles)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create or replace function public.admin_reports(p_open boolean default true)
returns table (id uuid, kind text, details text, status text, created_at timestamptz, resolution text,
  booking_id uuid, booking_status public.booking_status, listing_id uuid, area_name text,
  reporter_id uuid, reporter_name text, other_id uuid, other_name text, paid_kobo bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select r.id, r.kind, r.details, r.status, r.created_at, r.resolution,
         r.booking_id, b.status, coalesce(r.listing_id, b.listing_id), l.area_name,
         r.reporter_id, rp.first_name,
         case when b.id is null then l.host_id when r.reporter_id = b.tenant_id then b.host_id else b.tenant_id end,
         op.first_name,
         (select coalesce(sum(p.amount_kobo), 0)::bigint from public.payments p where p.booking_id = b.id and p.status = 'success')
  from public.reports r
  left join public.bookings b on b.id = r.booking_id
  left join public.listings l on l.id = coalesce(r.listing_id, b.listing_id)
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles op on op.id = case when b.id is null then l.host_id when r.reporter_id = b.tenant_id then b.host_id else b.tenant_id end
  where (r.status <> 'closed') = p_open
  order by r.created_at
  limit 200;
end $$;

-- refund: give the corper back everything not yet paid out, and close the booking if it's still going.
-- release: close the report so held payouts can go to the host.
-- dismiss: close it with no money moving.
create or replace function public.admin_resolve_report(p_report uuid, p_outcome text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.reports;
  b public.bookings;
begin
  perform private.require_admin();
  if p_outcome not in ('refund', 'release', 'dismiss') then perform private.fail('outcome', 'Pick an outcome.'); end if;
  select * into r from public.reports where id = p_report for update;
  if r.id is null then perform private.fail('not_found', 'Report not found.'); end if;
  if r.booking_id is not null then select * into b from public.bookings where id = r.booking_id for update; end if;

  if p_outcome = 'refund' and b.id is not null then
    perform private.refund_all(b.id, 'admin_' || r.kind);
    if b.status not in ('closed', 'completed') then perform private.close(b, 'admin_' || r.kind, auth.uid()); end if;
  end if;
  update public.reports set status = 'closed', resolution = p_outcome || coalesce(': ' || nullif(trim(p_note), ''), ''),
    resolved_at = now(), resolved_by = auth.uid()
  where id = p_report;
  perform private.audit('resolve_report', 'report', p_report::text, jsonb_build_object('outcome', p_outcome, 'note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- Flagged chats
-- ---------------------------------------------------------------------------
create or replace function public.admin_flagged_chats()
returns table (conversation_id uuid, reasons text[], flagged_at timestamptz, tenant_id uuid, tenant_name text,
  host_id uuid, host_name text, area_name text, contacts_unlocked boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select c.id, array_agg(distinct f.reason), min(f.created_at), c.tenant_id, t.first_name, c.host_id, h.first_name,
         l.area_name, c.contacts_unlocked
  from private.chat_flags f
  join public.conversations c on c.id = f.conversation_id
  join public.profiles t on t.id = c.tenant_id
  join public.profiles h on h.id = c.host_id
  left join public.listings l on l.id = c.listing_id
  where f.reviewed_at is null
  group by c.id, t.first_name, h.first_name, l.area_name
  order by min(f.created_at)
  limit 200;
end $$;

-- The whole conversation as sent, with the original text of hidden messages and which ones were flagged.
create or replace function public.admin_chat(p_conversation uuid)
returns table (id bigint, sender_id uuid, sender_name text, kind text, body text, original text, image_path text,
  flagged boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  perform private.audit('read_chat', 'conversation', p_conversation::text);
  return query
  select m.id, m.sender_id, p.first_name, m.kind, m.body, o.body, m.image_path,
         exists (select 1 from private.chat_flags f where f.message_id = m.id), m.created_at
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
  left join private.message_originals o on o.message_id = m.id
  where m.conversation_id = p_conversation
  order by m.id
  limit 1000;
end $$;

create or replace function public.admin_review_chat(p_conversation uuid, p_outcome text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_outcome not in ('ok', 'warned', 'suspended') then perform private.fail('outcome', 'Pick an outcome.'); end if;
  update private.chat_flags set reviewed_at = now(), outcome = p_outcome where conversation_id = p_conversation and reviewed_at is null;
  update public.conversations set flagged = false where id = p_conversation and p_outcome = 'ok';
  if p_outcome = 'warned' then
    perform private.post_system(p_conversation,
      'Bunkie reviewed this chat. Keep payments and contact details in Bunkie, or the account will be suspended.',
      jsonb_build_object('type', 'pay_safety', 'by', 'admin'));
  end if;
  perform private.audit('review_chat', 'conversation', p_conversation::text, jsonb_build_object('outcome', p_outcome, 'note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- Listings in review (photos taken far from the pin)
-- ---------------------------------------------------------------------------
create or replace function public.admin_listings(p_status public.listing_status default 'flagged')
returns table (id uuid, area_name text, status public.listing_status, host_id uuid, host_name text, monthly_total int,
  address_line text, lat double precision, lng double precision, photos jsonb, published_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select l.id, l.area_name, l.status, l.host_id, h.first_name, l.monthly_total, loc.address_line, loc.lat, loc.lng,
         coalesce((select jsonb_agg(jsonb_build_object('path', p.path, 'shot', p.shot, 'distance_m', p.distance_m,
                                                       'flagged', p.flagged, 'taken_at', p.taken_at) order by p.position)
                   from public.listing_photos p where p.listing_id = l.id), '[]'),
         l.published_at
  from public.listings l
  join public.profiles h on h.id = l.host_id
  left join public.listing_locations loc on loc.listing_id = l.id
  where l.status = p_status
  order by l.updated_at
  limit 200;
end $$;

create or replace function public.admin_listing_decision(p_listing uuid, p_outcome text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_outcome = 'approve' then
    update public.listing_photos set flagged = false where listing_id = p_listing;
    update public.listings set status = 'live', published_at = coalesce(published_at, now()) where id = p_listing;
  elsif p_outcome = 'pause' then
    update public.listings set status = 'paused' where id = p_listing;
  elsif p_outcome = 'remove' then
    update public.listings set status = 'archived' where id = p_listing;
  else
    perform private.fail('outcome', 'Pick an outcome.');
  end if;
  perform private.audit('listing_' || p_outcome, 'listing', p_listing::text, jsonb_build_object('note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- ID checks and documents
-- ---------------------------------------------------------------------------
create or replace function public.admin_verifications(p_status text default null, p_kind text default null)
returns table (id uuid, user_id uuid, first_name text, kind text, status text, provider text, masked_name text,
  path text, result jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select v.id, v.user_id, p.first_name, v.kind, v.status, v.provider, v.masked_name,
         coalesce(v.doc_path, v.result ->> 'path'), v.result, v.created_at
  from private.verifications v
  join public.profiles p on p.id = v.user_id
  where (p_status is null or v.status = p_status) and (p_kind is null or v.kind = p_kind)
  order by v.created_at desc
  limit 200;
end $$;

-- A person on the team checked the document: record the outcome the same way a provider would.
create or replace function public.admin_set_verification(p_user uuid, p_kind text, p_passed boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  perform public.sys_record_verification(p_user, p_kind, p_passed, 'admin', auth.uid()::text, null, null,
                                         jsonb_build_object('note', p_note));
  perform private.audit('verification_' || case when p_passed then 'pass' else 'fail' end, 'user', p_user::text,
                        jsonb_build_object('kind', p_kind, 'note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create or replace function public.admin_people(p_query text default null)
returns table (id uuid, first_name text, last_name text, email text, phone text, is_verified boolean, is_host boolean,
  standing smallint, corper_status public.corper_status, corper_verified boolean, suspended_at timestamptz,
  suspended_reason text, created_at timestamptz, listings int, bookings int, reports_against int)
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := nullif(trim(p_query), '');
begin
  perform private.require_admin();
  return query
  select p.id, p.first_name, pp.last_name, u.email::text, pp.phone, p.is_verified, p.is_host, p.standing,
         p.corper_status, p.corper_verified, p.suspended_at, p.suspended_reason, p.created_at,
         (select count(*)::int from public.listings l where l.host_id = p.id),
         (select count(*)::int from public.bookings b where b.tenant_id = p.id or b.host_id = p.id),
         (select count(*)::int from public.reports r join public.bookings b on b.id = r.booking_id
          where r.reporter_id <> p.id and (b.tenant_id = p.id or b.host_id = p.id))
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profile_private pp on pp.user_id = p.id
  where q is null or p.first_name ilike '%' || q || '%' or pp.last_name ilike '%' || q || '%'
     or u.email ilike '%' || q || '%' or pp.phone like '%' || q || '%' or p.id::text = q
  order by p.suspended_at desc nulls last, p.created_at desc
  limit 100;
end $$;

create or replace function public.admin_suspend(p_user uuid, p_suspend boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_user = auth.uid() then perform private.fail('self', 'You can''t suspend yourself.'); end if;
  update public.profiles set suspended_at = case when p_suspend then now() end,
    suspended_reason = case when p_suspend then nullif(trim(p_reason), '') end
  where id = p_user;
  perform private.audit(case when p_suspend then 'suspend' else 'restore' end, 'user', p_user::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_log(p_limit int default 100)
returns table (id bigint, admin_name text, action text, target_type text, target_id text, details jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select a.id, p.first_name, a.action, a.target_type, a.target_id, a.details, a.created_at
  from private.admin_actions a left join public.profiles p on p.id = a.admin_id
  order by a.id desc limit least(p_limit, 500);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.am_admin()', 'public.admin_overview()', 'public.admin_reports(boolean)', 'public.admin_resolve_report(uuid, text, text)',
    'public.admin_flagged_chats()', 'public.admin_chat(uuid)', 'public.admin_review_chat(uuid, text, text)',
    'public.admin_listings(public.listing_status)', 'public.admin_listing_decision(uuid, text, text)',
    'public.admin_verifications(text, text)', 'public.admin_set_verification(uuid, text, boolean, text)',
    'public.admin_people(text)', 'public.admin_suspend(uuid, boolean, text)', 'public.admin_log(int)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Suspended people are stopped at the door of each action.
create or replace function public.request_room(
  p_listing uuid, p_move_in date, p_months int default null, p_message text default null, p_weeks int default null)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_me public.profile_private;
  v_prof public.profiles;
  v_l public.listings;
  v_camp_end date;
  v_open int;
  v_in_lane boolean;
  v_row public.bookings;
  v_move_out date;
begin
  if v_uid is null then perform private.fail('auth', 'Log in to request a room.'); end if;
  perform private.assert_active(v_uid);

  -- Lock the tenant so two taps can't both pass the open-request limit.
  select * into v_me from public.profile_private where user_id = v_uid for update;
  select * into v_prof from public.profiles where id = v_uid;
  select * into v_l from public.listings where id = p_listing;

  if v_l.id is null or v_l.status <> 'live' then perform private.fail('not_available', 'This room is no longer available.'); end if;
  if v_l.host_id = v_uid then perform private.fail('own_room', 'You can''t request your own room.'); end if;
  if private.setting_bool('require_verification_to_request', true) and not v_prof.is_verified then
    perform private.fail('verify', 'Verify your ID before sending a request.');
  end if;
  -- A stay is either 1-4 weeks (short stay, if the host offers it) or months within the host's range.
  if (p_months is null) = (p_weeks is null) then perform private.fail('length', 'Pick how long you''re staying.'); end if;
  if p_weeks is not null then
    if not v_l.open_to_short or coalesce(v_l.weekly_price, 0) <= 0 then
      perform private.fail('weeks', 'This host doesn''t take short stays.');
    end if;
    if p_weeks not between 1 and 4 then perform private.fail('weeks', 'Short stays are 1 to 4 weeks.'); end if;
  elsif p_months < v_l.min_months or p_months > v_l.max_months then
    perform private.fail('months', format('This room is for %s to %s months.', v_l.min_months, v_l.max_months));
  end if;
  v_move_out := case when p_weeks is not null then p_move_in + 7 * p_weeks
                     else (p_move_in + make_interval(months => p_months))::date end;
  if p_move_in < current_date then perform private.fail('date', 'Pick a move-in date from today on.'); end if;
  if v_l.available_from is not null and p_move_in < v_l.available_from then
    perform private.fail('date', 'The room isn''t free on that date.');
  end if;

  -- Both sides must fit: the tenant's own gender against the household, and the tenant's pick.
  if v_me.gender is not null and (
       (v_l.household = 'women' and v_me.gender <> 'female') or
       (v_l.household = 'men' and v_me.gender <> 'male')) then
    perform private.fail('household', 'This home is for a different household.');
  end if;
  if (v_me.share_pref = 'women_only' and v_l.household <> 'women') or
     (v_me.share_pref = 'men_only' and v_l.household <> 'men') then
    perform private.fail('household', 'This home doesn''t match who you want to live with.');
  end if;

  -- In camp: only hosts open to camp bookings, move-in on the camp exit date, landing pad length.
  if v_me.nysc_stage = 'in_camp' then
    select camp_end into v_camp_end from public.nysc_batches where id = v_me.batch_id;
    if not v_l.open_to_camp then perform private.fail('camp', 'This host isn''t taking camp bookings.'); end if;
    if v_camp_end is not null and p_move_in <> v_camp_end then
      perform private.fail('camp', 'Camp bookings move in on your camp exit day.');
    end if;
    if p_months > 3 then perform private.fail('camp', 'Camp bookings are up to 3 months.'); end if;
  end if;

  if exists (select 1 from public.bookings
             where listing_id = p_listing and status in ('paid', 'moved_in', 'active', 'ending')
               and stay && daterange(p_move_in, v_move_out)) then
    perform private.fail('taken', 'The room is booked for those dates.');
  end if;

  select count(*) into v_open from public.bookings
  where tenant_id = v_uid and status in ('requested', 'accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed');
  if v_open >= private.setting_int('max_open_requests', 3) then
    perform private.fail('limit', format('You can have %s open requests. Withdraw one to send another.',
                                         private.setting_int('max_open_requests', 3)));
  end if;

  v_in_lane := exists (select 1 from public.bookings where listing_id = p_listing
                       and status in ('accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed'));

  insert into public.bookings (listing_id, tenant_id, host_id, is_camp_booking, move_in, months, weeks, weekly_price,
                               move_out, monthly_total, message, deadline_at)
  values (p_listing, v_uid, v_l.host_id, coalesce(v_me.nysc_stage = 'in_camp', false), p_move_in, p_months, p_weeks,
          case when p_weeks is not null then v_l.weekly_price end, v_move_out, v_l.monthly_total,
          nullif(left(trim(p_message), 500), ''),
          case when v_in_lane then null
               else now() + make_interval(hours => private.setting_int('host_reply_hours', 12)) end)
  returning * into v_row;

  insert into public.booking_events (booking_id, actor_id, action, to_status, payload)
  values (v_row.id, v_uid, 'request', 'requested', jsonb_build_object('move_in', p_move_in, 'months', p_months, 'weeks', p_weeks));
  perform private.notify(v_l.host_id, 'request_new', v_row.id);
  return v_row;
exception
  when unique_violation then
    perform private.fail('duplicate', 'You already have a request for this room.');
end $$;

create or replace function public.send_message(
  p_conversation uuid, p_client_id uuid, p_body text default null,
  p_image_path text default null, p_image_w int default null, p_image_h int default null
) returns public.messages
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  c public.conversations;
  v_existing public.messages;
  v_body text := nullif(trim(p_body), '');
  v_clean text;
  v_other uuid;
  v_msg public.messages;
begin
  if v_uid is null then perform private.fail('auth', 'Sign in to send messages.'); end if;
  perform private.assert_active(v_uid);
  select * into c from public.conversations where id = p_conversation;
  if c.id is null or v_uid not in (c.tenant_id, c.host_id) then perform private.fail('not_found', 'Chat not found.'); end if;
  v_other := case when v_uid = c.tenant_id then c.host_id else c.tenant_id end;

  -- A retry of a message that already arrived returns it instead of sending it twice.
  if p_client_id is not null then
    select * into v_existing from public.messages where sender_id = v_uid and client_id = p_client_id;
    if v_existing.id is not null then return v_existing; end if;
  end if;

  if v_body is null and p_image_path is null then perform private.fail('empty', 'Type a message.'); end if;
  if char_length(v_body) > 2000 then perform private.fail('long', 'Messages can be up to 2,000 characters.'); end if;
  if p_image_path is not null and p_image_path not like p_conversation || '/%' then
    perform private.fail('image', 'That photo isn''t in this chat.');
  end if;
  if exists (select 1 from public.blocks where (blocker_id = v_other and blocked_id = v_uid)
                                            or (blocker_id = v_uid and blocked_id = v_other)) then
    perform private.fail('blocked', 'You can''t message this person.');
  end if;
  if (select count(*) from public.messages where sender_id = v_uid and created_at > now() - interval '1 minute')
     >= private.setting_int('max_messages_per_minute', 20) then
    perform private.fail('slow_down', 'You''re sending messages very fast. Wait a moment.');
  end if;

  v_clean := case when c.contacts_unlocked then v_body else private.redact_contacts(v_body) end;
  v_msg := private.post(p_conversation, v_uid, case when p_image_path is null then 'text' else 'image' end,
                        v_clean, '{}', p_client_id, p_image_path, p_image_w, p_image_h,
                        case when v_clean is distinct from v_body then v_body end);

  -- Asking for money outside Bunkie: flag for review and remind the other person, once per chat.
  if private.scam_phrase(v_body) then
    insert into private.chat_flags (conversation_id, message_id, reason) values (c.id, v_msg.id, 'off_platform_payment');
    update public.conversations set flagged = true where id = c.id;
    if not exists (select 1 from public.messages where conversation_id = c.id and kind = 'system' and meta ->> 'type' = 'pay_safety') then
      perform private.post_system(c.id,
        'Only pay through Bunkie. Money sent to a personal account isn''t protected, and Bunkie can''t get it back.',
        jsonb_build_object('type', 'pay_safety'));
    end if;
  end if;

  -- If it's still unread in 10 minutes, the worker sends one WhatsApp nudge (no message text).
  perform private.enqueue('whatsapp', jsonb_build_object('user_id', v_other, 'template', 'new_message',
                          'conversation_id', c.id, 'message_id', v_msg.id), now() + interval '10 minutes');
  return v_msg;
end $$;

create or replace function public.start_conversation(p_listing uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_l public.listings;
  v_id uuid;
begin
  if v_uid is null then perform private.fail('auth', 'Sign in to message hosts.'); end if;
  perform private.assert_active(v_uid);
  select * into v_l from public.listings where id = p_listing;
  if v_l.id is null then perform private.fail('not_found', 'This room is no longer available.'); end if;
  if v_l.host_id = v_uid then perform private.fail('own_room', 'This is your own room.'); end if;

  select id into v_id from public.conversations where listing_id = p_listing and tenant_id = v_uid;
  if v_id is not null then return v_id; end if;

  if v_l.status <> 'live' then perform private.fail('not_available', 'This room is no longer available.'); end if;
  if exists (select 1 from public.blocks where (blocker_id = v_l.host_id and blocked_id = v_uid)
                                            or (blocker_id = v_uid and blocked_id = v_l.host_id)) then
    perform private.fail('blocked', 'You can''t message this host.');
  end if;
  if (select count(*) from public.conversations where tenant_id = v_uid and created_at > now() - interval '1 day')
     >= private.setting_int('max_new_chats_per_day', 10) then
    perform private.fail('limit', 'You''ve started a lot of chats today. Try again tomorrow.');
  end if;
  return private.conversation_for(p_listing, v_uid, v_l.host_id);
end $$;

create or replace function public.publish_listing(p_listing uuid) returns public.listings
language plpgsql security definer set search_path = '' as $$
declare
  v_missing text[];
  v_loc public.listing_locations;
  v_flagged boolean;
  v_row public.listings;
begin
  perform private.assert_active(auth.uid());
  select * into v_row from public.listings where id = p_listing and host_id = auth.uid() for update;
  if v_row.id is null then perform private.fail('not_found', 'Listing not found.'); end if;
  v_missing := public.listing_missing(p_listing);
  if cardinality(v_missing) > 0 then
    perform private.fail('missing', 'Finish these first: ' || array_to_string(v_missing, ', '));
  end if;
  select * into v_loc from public.listing_locations where listing_id = p_listing;
  v_flagged := exists (select 1 from public.listing_photos where listing_id = p_listing and flagged);

  update public.listings set
    status = (case when v_flagged then 'flagged' else 'live' end)::public.listing_status,
    published_at = coalesce(published_at, now()),
    area_lat = round((v_loc.lat / 0.003)::numeric) * 0.003,
    area_lng = round((v_loc.lng / 0.003)::numeric) * 0.003
  where id = p_listing
  returning * into v_row;

  perform private.enqueue('commute', jsonb_build_object('listing_id', p_listing));
  return v_row;
end $$;

create or replace function public.find_rooms(
  p_mode text default 'any',               -- 'camp' | 'ppa' | 'any'
  p_move_in date default null,             -- camp exit day, or the move-in the person picked
  p_lat double precision default null,     -- exact search point (their PPA), when known
  p_lng double precision default null,
  p_zone smallint default null,            -- nearest PPA zone (for Google drive times)
  p_budget_max int default null,           -- monthly, all in
  p_pref public.share_pref default 'mixed_ok',
  p_room public.room_kind default null,
  p_stay text default 'any',               -- 'weeks' | 'short' (1-3 months) | 'long' (6-12) | 'any'
  p_max_minutes int default null,
  p_limit int default 40
)
returns table (
  id uuid, area_name text, area_lat double precision, area_lng double precision,
  room_kind public.room_kind, bath_kind public.bath_kind, furnished boolean, household public.household,
  open_to_camp boolean, min_months smallint, max_months smallint, available_from date,
  monthly_total int, total_varies boolean, deposit int, pay_schedule public.pay_schedule,
  open_to_short boolean, weekly_price int, photo_count smallint, cover_path text,
  host_id uuid, host_first_name text, host_photo_path text, host_verified boolean, host_corper public.corper_status,
  host_answers jsonb, commute_min int, ease_min int, published_at timestamptz,
  free_from date, match_score int, exact boolean, misses jsonb, inspection_fee int, being_viewed_until timestamptz
)
language sql stable security definer set search_path = '' as $$
  with params as (
    select
      coalesce(p_move_in, current_date) as want,
      -- How far past the ask a near miss may go.
      case when p_budget_max is null then null else greatest(p_budget_max * 0.25, 10000)::int end as budget_slack,
      case when p_mode = 'camp' then 14 else 30 end as later_slack,
      20 as minutes_slack,
      -- Without a commute limit, near misses still stay within reach of the search point.
      coalesce(p_max_minutes, 45) as reach
  ),
  base as (
    select l.*,
      -- Booked over the wanted date: free again when that stay ends.
      greatest(l.available_from, (select max(upper(b.stay)) from public.bookings b
                                  where b.listing_id = l.id and b.status in ('paid', 'moved_in', 'active', 'ending')
                                    and b.stay @> (select want from params))) as free_from,
      case
        when p_lat is not null then coalesce(
          -- Google drive time for the zone when the search point is close to that zone's centre.
          (select cm.minutes from public.commute_minutes cm join public.ppa_zones z on z.id = cm.zone_id
           where cm.listing_id = l.id and cm.zone_id = p_zone
             and public.distance_m(z.lat, z.lng, p_lat, p_lng) < 1500),
          public.estimate_minutes(l.area_lat, l.area_lng, p_lat, p_lng))
        when p_zone is not null then coalesce(
          (select cm.minutes from public.commute_minutes cm where cm.listing_id = l.id and cm.zone_id = p_zone),
          (select public.estimate_minutes(l.area_lat, l.area_lng, z.lat, z.lng) from public.ppa_zones z where z.id = p_zone))
      end as commute_min,
      coalesce((select avg(cm.minutes)::int from public.commute_minutes cm where cm.listing_id = l.id),
               public.estimate_minutes(l.area_lat, l.area_lng, 9.0579, 7.4951)) as ease_min,   -- Central Area
      -- What the person compares with their monthly budget.
      case when p_stay = 'weeks' and l.open_to_short then l.weekly_price * 4 else l.monthly_total end as price_basis
    from public.listings l
    where l.status = 'live'
      and not exists (select 1 from public.profiles hp where hp.id = l.host_id and hp.suspended_at is not null)
      -- Dealbreakers.
      and (p_pref = 'mixed_ok' or (p_pref = 'women_only' and l.household = 'women') or (p_pref = 'men_only' and l.household = 'men'))
      and (p_mode <> 'camp' or (l.open_to_camp and (l.min_months <= 3 or l.open_to_short)))
  ),
  checked as (
    select b.*, (select want from params) as want,
      jsonb_build_array(
        case when p_budget_max is not null and b.price_basis > p_budget_max
             then jsonb_build_object('kind', 'over_budget', 'by', b.price_basis - p_budget_max) end,
        case when p_move_in is not null and b.free_from is not null and b.free_from > p_move_in
             then jsonb_build_object('kind', 'later', 'days', b.free_from - p_move_in, 'on', b.free_from) end,
        case when p_max_minutes is not null and b.commute_min > p_max_minutes
             then jsonb_build_object('kind', 'farther', 'minutes', b.commute_min) end,
        -- A self contain more than satisfies someone asking for their own room.
        case when p_room is not null and b.room_kind <> p_room and not (p_room = 'own_room' and b.room_kind = 'self_contain')
             then jsonb_build_object('kind', 'room', 'is', b.room_kind) end,
        case when p_stay = 'weeks' and not b.open_to_short then jsonb_build_object('kind', 'no_short') end,
        case when p_stay = 'short' and b.min_months > 3 and not b.open_to_short
             then jsonb_build_object('kind', 'min_stay', 'months', b.min_months) end,
        case when p_stay = 'long' and b.max_months < 6 then jsonb_build_object('kind', 'max_stay', 'months', b.max_months) end
      ) as raw_misses
    from base b, params
    -- Beyond the allowances it isn't a near miss any more.
    where (p_budget_max is null or b.price_basis <= p_budget_max + params.budget_slack)
      and (p_move_in is null or b.free_from is null or b.free_from <= p_move_in + params.later_slack)
      and (b.commute_min is null or b.commute_min <= greatest(params.reach, coalesce(p_max_minutes, 0) + params.minutes_slack)
           or (p_lat is null and p_zone is null))
  ),
  scored as (
    select c.*,
      (select coalesce(jsonb_agg(m), '[]') from jsonb_array_elements(c.raw_misses) m where m <> 'null') as miss_list
    from checked c
  )
  select r.* from (
  select s.id, s.area_name, s.area_lat, s.area_lng, s.room_kind, s.bath_kind, s.furnished, s.household,
         s.open_to_camp, s.min_months, s.max_months, s.available_from, s.monthly_total, s.total_varies,
         s.deposit, s.pay_schedule, s.open_to_short, case when s.open_to_short then s.weekly_price end,
         s.photo_count, s.cover_path,
         s.host_id, pr.first_name, pr.photo_path, pr.is_verified,
         case when pr.corper_verified then pr.corper_status end,
         case when a.user_id is null then null
              else jsonb_build_object('sleep', a.sleep, 'guests', a.guests, 'cooking', a.cooking,
                                      'cleaning', a.cleaning, 'noise', a.noise) end,
         s.commute_min, s.ease_min, s.published_at, s.free_from,
         greatest(0, least(100, round(
             -- Commute (or, in camp, how central it is): the biggest part.
             40 * exp(-coalesce(case when p_mode = 'camp' then s.ease_min else s.commute_min end, 20) / 25.0)
             -- Price against budget: within budget scores well, cheaper a little better; over budget fades out.
           + case when p_budget_max is null then 10
                  when s.price_basis <= p_budget_max then 15 - 5 * (s.price_basis::numeric / greatest(p_budget_max, 1))
                  else 10 * greatest(0, 1 - (s.price_basis - p_budget_max)::numeric / greatest(p_budget_max * 0.25, 10000)) end
           + case when pr.corper_verified and pr.corper_status in ('serving', 'served') then 12 else 0 end
           + case when pr.is_verified then 5 else 0 end
           + case when s.free_from is null or s.free_from <= s.want then 5
                  when p_move_in is null then 5 * exp(-(s.free_from - s.want) / 30.0) else 0 end
           + 5 * exp(-extract(epoch from now() - s.published_at) / 86400 / 30.0)
           + case when s.photo_count >= 6 then 2 else 0 end
           - 8 * jsonb_array_length(s.miss_list)
         )))::int,
         jsonb_array_length(s.miss_list) = 0,
         s.miss_list,
         s.inspection_fee,
         private.listing_hold(s.id)
  from scored s
  join public.profiles pr on pr.id = s.host_id
  left join public.bunkie_answers a on a.user_id = s.host_id and a.approved_at is not null
  ) r (id, area_name, area_lat, area_lng, room_kind, bath_kind, furnished, household, open_to_camp, min_months,
       max_months, available_from, monthly_total, total_varies, deposit, pay_schedule, open_to_short, weekly_price,
       photo_count, cover_path, host_id, host_first_name, host_photo_path, host_verified, host_corper, host_answers,
       commute_min, ease_min, published_at, free_from, match_score, exact, misses, inspection_fee, being_viewed_until)
  order by r.exact desc, r.match_score desc, r.published_at desc
  limit least(p_limit, 60)
$$;
