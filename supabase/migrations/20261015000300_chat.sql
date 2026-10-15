-- In-app chat between a corper and a host.
--
-- * One conversation per (listing, corper). Bookings for that pair link to it, and booking steps
--   appear in it as system messages, so a stay has one timeline.
-- * Messages are written only through send_message(): membership, blocks, rate limits, idempotency
--   (client_id) and contact hiding live in one place.
-- * Until a stay in the conversation is paid, phone numbers, account numbers, bank/app names, emails,
--   links and handles are replaced with "•••". The original is kept privately for scam reviews.
-- * Live delivery uses Realtime Broadcast from the database on private channels
--   (chat:<conversation> and inbox:<user>); see the *_chat_platform migration for channel access.
-- * Ids are an increasing bigint, so history pages by "id < x" on (conversation_id, id) and the
--   table can be partitioned later without changing the API.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings (id) on delete set null,
  tenant_id uuid not null references public.profiles (id) on delete cascade,
  host_id uuid not null references public.profiles (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,   -- the latest booking between them
  contacts_unlocked boolean not null default false,                      -- true once a stay here is paid
  flagged boolean not null default false,                                -- scam phrases seen; for review
  last_message_id bigint,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid,
  created_at timestamptz not null default now(),
  unique (listing_id, tenant_id),
  check (tenant_id <> host_id)
);
create index conversations_tenant_idx on public.conversations (tenant_id, last_message_at desc);
create index conversations_host_idx on public.conversations (host_id, last_message_at desc);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('tenant', 'host')),
  last_read_id bigint not null default 0,
  last_read_at timestamptz,
  muted boolean not null default false,
  archived boolean not null default false,
  notified_at timestamptz,                                               -- last "new message" WhatsApp
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,     -- null: Bunkie (system)
  kind text not null check (kind in ('text', 'image', 'system')),
  body text check (char_length(body) <= 2000),
  image_path text,
  image_w int,
  image_h int,
  meta jsonb not null default '{}',
  client_id uuid,                                                        -- the phone's id, for safe retries
  redacted boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind <> 'text' or char_length(trim(body)) > 0),
  check (kind <> 'image' or image_path is not null)
);
create index messages_conversation_idx on public.messages (conversation_id, id desc);
create index messages_sender_recent_idx on public.messages (sender_id, created_at desc) where sender_id is not null;
create unique index messages_client_idx on public.messages (sender_id, client_id) where client_id is not null;

-- Originals of redacted messages and scam flags: never exposed through the API.
create table private.message_originals (
  message_id bigint primary key references public.messages (id) on delete cascade,
  body text not null
);
create table private.chat_flags (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id bigint references public.messages (id) on delete cascade,
  reporter_id uuid,                                                      -- null: found automatically
  reason text not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;

create or replace function private.is_member(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members m
                 where m.conversation_id = p_conversation and m.user_id = auth.uid())
$$;

revoke all on public.conversations, public.conversation_members, public.messages, public.blocks from anon, authenticated;
grant select on public.conversations, public.conversation_members, public.messages to authenticated;
grant select, insert, delete on public.blocks to authenticated;

create policy "members read" on public.conversations for select to authenticated
  using (tenant_id = (select auth.uid()) or host_id = (select auth.uid()));
create policy "members read" on public.conversation_members for select to authenticated
  using (private.is_member(conversation_id));
create policy "members read" on public.messages for select to authenticated
  using (private.is_member(conversation_id));
create policy "own blocks" on public.blocks for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Live delivery (no-op where Realtime isn't installed, e.g. the local test database)
-- ---------------------------------------------------------------------------
create or replace function private.broadcast(p_topic text, p_event text, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is not null then
    perform realtime.send(p_payload, p_event, p_topic, true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Contact hiding and scam phrases
-- ---------------------------------------------------------------------------
-- Replaces ways of moving the conversation (or money) off Bunkie with •••. Returns the text unchanged
-- when nothing matched.
create or replace function private.redact_contacts(p_text text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  t text := p_text;
  d text := '(zero|oh|o|one|two|three|four|five|six|seven|eight|nine|ten|double|triple)';
begin
  if t is null then return null; end if;
  -- Emails and links.
  t := regexp_replace(t, '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '•••', 'gi');
  t := regexp_replace(t, '(https?://|www\.)\S+', '•••', 'gi');
  t := regexp_replace(t, '\m(wa\.me|t\.me|bit\.ly|linktr\.ee)\S*', '•••', 'gi');
  t := regexp_replace(t, '\m[[:alnum:]-]+\.(com|ng|me|io|net|org|co|app|link)\M(/\S*)?', '•••', 'gi');
  -- Phone numbers (Nigerian formats, with spaces, dots or the letter O for zero) and 10-11 digit
  -- account/phone numbers however they're split up. Prices and dates are shorter, so they stay.
  t := regexp_replace(t, '(\+?[[:space:]]*234|[0oO])[[:space:]().-]*[789][[:space:]().-]*[01oO]([[:space:]().-]*[0-9oO]){8}', '•••', 'g');
  t := regexp_replace(t, '[0-9]([[:space:]().+/-]*[0-9]){9,10}', '•••', 'g');
  -- Digits spelled out: five or more number words in a row ("zero eight zero three ...").
  t := regexp_replace(t, '\m' || d || '\M([[:space:],.-]+' || d || '\M){4,}', '•••', 'gi');
  -- Handles and off-platform apps, banks and wallets.
  t := regexp_replace(t, '(^|[[:space:]])@[[:alnum:]_.]{3,}', '\1•••', 'g');
  t := regexp_replace(t,
    '\m(whats ?app|watsapp|whatsap|wassap|watsap|wa|telegram|instagram|insta|ig|snapchat|facebook|fb|tiktok|'
    || 'opay|palm ?pay|moniepoint|monie point|kuda|gtbank|gtb|guaranty trust|access bank|zenith|uba|first ?bank|fidelity|wema|'
    || 'alat|sterling|union bank|polaris|stanbic|fcmb|ecobank|keystone|providus|jaiz|carbon|vbank|paga|chipper|'
    || 'acct|account (no|number|num)|acc no)\M', '•••', 'gi');
  return t;
end $$;

-- True when the text asks for money outside Bunkie (flag for review, warn the other person).
create or replace function private.scam_phrase(p_text text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_text, '') ~* any (array[
    '(pay|send|transfer|drop|credit)[^.!?]{0,40}(my|this|the|personal|direct)[^.!?]{0,20}(account|acct|acc|number|wallet|bank|opay|palm ?pay|moniepoint|kuda)',
    '(inspection|agent|agency|form|viewing|registration|caution)[^.!?]{0,25}(fee|money|charge)[^.!?]{0,40}(first|before|upfront|now|today|to me|directly)',
    '(outside|off|without)[^.!?]{0,10}(bunkie|the app|this app|app)',
    '(avoid|skip|dodge|bypass|save)[^.!?]{0,20}(fee|charge|commission|bunkie)',
    '(pay|paying|payment)[^.!?]{0,15}(cash|direct|directly|to me|by hand)',
    '(deposit|advance)[^.!?]{0,30}(before|first|to hold|to secure|to reserve)'
  ])
$$;

-- ---------------------------------------------------------------------------
-- Writing messages
-- ---------------------------------------------------------------------------
-- Stores a message, updates the conversation, and pushes it live to both people.
create or replace function private.post(
  p_conversation uuid, p_sender uuid, p_kind text, p_body text, p_meta jsonb default '{}',
  p_client_id uuid default null, p_image_path text default null, p_image_w int default null, p_image_h int default null,
  p_original text default null
) returns public.messages
language plpgsql security definer set search_path = '' as $$
declare
  v_msg public.messages;
  v_preview text;
  m record;
begin
  insert into public.messages (conversation_id, sender_id, kind, body, meta, client_id, image_path, image_w, image_h, redacted)
  values (p_conversation, p_sender, p_kind, p_body, coalesce(p_meta, '{}'), p_client_id, p_image_path, p_image_w, p_image_h,
          p_original is not null)
  returning * into v_msg;
  if p_original is not null then
    insert into private.message_originals (message_id, body) values (v_msg.id, p_original);
  end if;

  v_preview := case p_kind when 'image' then 'Photo' else left(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'), 120) end;
  update public.conversations set last_message_id = v_msg.id, last_message_at = v_msg.created_at,
    last_message_preview = v_preview, last_sender_id = p_sender
  where id = p_conversation;
  if p_sender is not null then
    update public.conversation_members set last_read_id = v_msg.id, last_read_at = now(), archived = false
    where conversation_id = p_conversation and user_id = p_sender;
  end if;
  update public.conversation_members set archived = false
  where conversation_id = p_conversation and user_id is distinct from p_sender;

  perform private.broadcast('chat:' || p_conversation, 'message', to_jsonb(v_msg));
  for m in select user_id from public.conversation_members where conversation_id = p_conversation loop
    perform private.broadcast('inbox:' || m.user_id, 'conversation',
      jsonb_build_object('conversation_id', p_conversation, 'message_id', v_msg.id, 'preview', v_preview,
                         'sender_id', p_sender, 'at', v_msg.created_at));
  end loop;
  return v_msg;
end $$;

-- A Bunkie message in the conversation (booking steps, safety notes).
create or replace function private.post_system(p_conversation uuid, p_body text, p_meta jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  select private.post(p_conversation, null, 'system', p_body, p_meta)
$$;

-- The conversation for a listing and corper, created on first use.
create or replace function private.conversation_for(p_listing uuid, p_tenant uuid, p_host uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.conversations where listing_id = p_listing and tenant_id = p_tenant;
  if v_id is not null then return v_id; end if;
  insert into public.conversations (listing_id, tenant_id, host_id) values (p_listing, p_tenant, p_host)
  on conflict (listing_id, tenant_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversations where listing_id = p_listing and tenant_id = p_tenant;
  else
    insert into public.conversation_members (conversation_id, user_id, role)
    values (v_id, p_tenant, 'tenant'), (v_id, p_host, 'host');
  end if;
  return v_id;
end $$;

-- "Message host" from a room page. Returns the conversation (existing or new).
create or replace function public.start_conversation(p_listing uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_l public.listings;
  v_id uuid;
begin
  if v_uid is null then perform private.fail('auth', 'Sign in to message hosts.'); end if;
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

-- Marks everything up to p_message as read and tells the other side (for "Seen").
create or replace function public.mark_read(p_conversation uuid, p_message bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_new bigint;
begin
  update public.conversation_members set last_read_id = greatest(last_read_id, p_message), last_read_at = now()
  where conversation_id = p_conversation and user_id = v_uid and last_read_id < p_message
  returning last_read_id into v_new;
  if v_new is not null then
    perform private.broadcast('chat:' || p_conversation, 'read', jsonb_build_object('user_id', v_uid, 'last_read_id', v_new));
    perform private.broadcast('inbox:' || v_uid, 'read', jsonb_build_object('conversation_id', p_conversation));
  end if;
end $$;

create or replace function public.set_chat_prefs(p_conversation uuid, p_muted boolean default null, p_archived boolean default null)
returns void language sql security definer set search_path = '' as $$
  update public.conversation_members set muted = coalesce(p_muted, muted), archived = coalesce(p_archived, archived)
  where conversation_id = p_conversation and user_id = auth.uid()
$$;

create or replace function public.report_message(p_message bigint, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
begin
  select conversation_id into v_conv from public.messages where id = p_message;
  if v_conv is null or not private.is_member(v_conv) then perform private.fail('not_found', 'Message not found.'); end if;
  insert into private.chat_flags (conversation_id, message_id, reporter_id, reason)
  values (v_conv, p_message, auth.uid(), left(coalesce(nullif(trim(p_reason), ''), 'reported'), 200));
  update public.conversations set flagged = true where id = v_conv;
end $$;

-- ---------------------------------------------------------------------------
-- Inbox
-- ---------------------------------------------------------------------------
create or replace function public.my_conversations(p_limit int default 30, p_before timestamptz default null, p_archived boolean default false)
returns table (
  id uuid, listing_id uuid, booking_id uuid, booking_status public.booking_status, role text,
  other_id uuid, other_name text, other_photo text, other_verified boolean,
  area_name text, cover_path text,
  last_message_id bigint, last_message_at timestamptz, last_message_preview text, last_sender_id uuid,
  unread int, muted boolean, other_last_read_id bigint, contacts_unlocked boolean
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.listing_id, c.booking_id, b.status, me.role,
         o.id, o.first_name, o.photo_path, o.is_verified,
         l.area_name, l.cover_path,
         c.last_message_id, c.last_message_at, c.last_message_preview, c.last_sender_id,
         (select count(*)::int from (select 1 from public.messages m
                                     where m.conversation_id = c.id and m.id > me.last_read_id
                                       and m.sender_id is distinct from me.user_id limit 99) u),
         me.muted, om.last_read_id, c.contacts_unlocked
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_members om on om.conversation_id = c.id and om.user_id <> me.user_id
  join public.profiles o on o.id = om.user_id
  left join public.listings l on l.id = c.listing_id
  left join public.bookings b on b.id = c.booking_id
  where me.user_id = auth.uid() and me.archived = p_archived and c.last_message_at is not null
    and (p_before is null or c.last_message_at < p_before)
  order by c.last_message_at desc
  limit least(p_limit, 50)
$$;

create or replace function public.unread_chats() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  where me.user_id = auth.uid() and not me.archived and c.last_message_id > me.last_read_id
    and c.last_sender_id is distinct from me.user_id
$$;

-- ---------------------------------------------------------------------------
-- Bookings in the chat
-- ---------------------------------------------------------------------------
-- A new booking links to the pair's conversation and its message becomes the first chat message.
create or replace function private.booking_to_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
  v_clean text;
begin
  v_conv := private.conversation_for(new.listing_id, new.tenant_id, new.host_id);
  update public.conversations set booking_id = new.id where id = v_conv;
  perform private.post_system(v_conv, 'Request sent', jsonb_build_object('type', 'booking', 'booking_id', new.id, 'action', 'request'));
  if new.message is not null then
    v_clean := private.redact_contacts(new.message);
    perform private.post(v_conv, new.tenant_id, 'text', v_clean, '{}', null, null, null, null,
                         case when v_clean is distinct from new.message then new.message end);
  end if;
  return null;
end $$;
create trigger booking_to_chat after insert on public.bookings
  for each row execute function private.booking_to_chat();

-- Booking steps appear in the chat; paying unlocks contact details for both.
create or replace function private.booking_event_to_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
  v_text text;
begin
  if new.action = 'request' then return null; end if;   -- posted by booking_to_chat
  select c.id into v_conv from public.conversations c where c.booking_id = new.booking_id;
  if v_conv is null then return null; end if;
  v_text := case
    when new.to_status = 'accepted' then 'Request accepted. Pick a viewing time.'
    when new.to_status = 'viewing_booked' then 'Viewing booked'
    when new.action = 'reschedule' then 'Viewing moved. Pick a new time.'
    when new.to_status = 'viewed' then 'Viewing done'
    when new.to_status = 'host_confirmed' then 'Agreement ready to confirm'
    when new.to_status = 'agreed' then 'Agreement confirmed. Pay to lock the room.'
    when new.to_status = 'paid' then 'Paid. Contact details are now visible.'
    when new.to_status = 'moved_in' then 'Checked in'
    when new.to_status = 'active' then 'Move-in confirmed'
    when new.to_status = 'ending' then 'Notice given'
    when new.to_status = 'moved_out' then 'Moved out'
    when new.to_status = 'closed' then 'Booking closed'
  end;
  if new.to_status = 'paid' then
    update public.conversations set contacts_unlocked = true where id = v_conv;
  end if;
  if v_text is not null then
    perform private.post_system(v_conv, v_text, jsonb_build_object('type', 'booking', 'booking_id', new.booking_id,
                                                                   'action', new.action, 'status', new.to_status));
  end if;
  return null;
end $$;
create trigger booking_event_to_chat after insert on public.booking_events
  for each row execute function private.booking_event_to_chat();

-- ---------------------------------------------------------------------------
-- WhatsApp nudge for unread messages (called by the worker)
-- ---------------------------------------------------------------------------
-- True (and records it) when the message is still unread, the chat isn't muted, and no nudge went
-- out for this chat in the last 30 minutes.
create or replace function public.sys_chat_should_notify(p_conversation uuid, p_user uuid, p_message bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_ok boolean;
begin
  update public.conversation_members set notified_at = now()
  where conversation_id = p_conversation and user_id = p_user and not muted
    and last_read_id < p_message and (notified_at is null or notified_at < now() - interval '30 minutes')
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

revoke execute on function public.sys_chat_should_notify(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.sys_chat_should_notify(uuid, uuid, bigint) to service_role;

revoke execute on function public.start_conversation(uuid), public.send_message(uuid, uuid, text, text, int, int),
  public.mark_read(uuid, bigint), public.set_chat_prefs(uuid, boolean, boolean), public.report_message(bigint, text),
  public.my_conversations(int, timestamptz, boolean), public.unread_chats() from public, anon;
grant execute on function public.start_conversation(uuid), public.send_message(uuid, uuid, text, text, int, int),
  public.mark_read(uuid, bigint), public.set_chat_prefs(uuid, boolean, boolean), public.report_message(bigint, text),
  public.my_conversations(int, timestamptz, boolean), public.unread_chats() to authenticated;

insert into public.settings (key, value) values ('max_new_chats_per_day', '10'), ('max_messages_per_minute', '20')
on conflict (key) do nothing;
