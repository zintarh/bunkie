-- "Post what you need": corpers say what room they want; anyone signed in can see it; hosts with a
-- live room can offer it, which opens a chat with the room attached. Matching reuses find_rooms.
--  * Shown as "Amaka is looking for a room in Utako · Batch B 2026": first name, area, batch.
--    No photo, surname or contact details.
--  * One open post per person. It closes when they book and stops showing after the move-in date
--    (plus a week) or 30 days, whichever comes first.

create table public.room_wants (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  area_label text not null check (char_length(area_label) between 2 and 80),
  lat double precision not null,
  lng double precision not null,
  zone_id smallint references public.ppa_zones (id),
  budget_max int check (budget_max between 5000 and 2000000),
  move_in date,
  months smallint check (months between 1 and 12),
  weeks smallint check (weeks between 1 and 4),
  room_kind public.room_kind,
  pref public.share_pref not null default 'mixed_ok',
  note text check (char_length(note) <= 200),
  status text not null default 'open' check (status in ('open', 'closed', 'booked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  check (months is null or weeks is null)
);
create unique index room_wants_one_open on public.room_wants (author_id) where status = 'open';
create index room_wants_open_idx on public.room_wants (created_at desc) where status = 'open';

create table public.want_offers (
  id uuid primary key default gen_random_uuid(),
  want_id uuid not null references public.room_wants (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  host_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (want_id, listing_id)
);
create index want_offers_host_idx on public.want_offers (host_id, created_at desc);

alter table public.room_wants enable row level security;
alter table public.want_offers enable row level security;
revoke all on public.room_wants, public.want_offers from anon, authenticated;
grant select on public.room_wants, public.want_offers to authenticated;
-- Your own posts in full; others' posts are read through want_feed() (first name, area, batch only).
create policy "own posts" on public.room_wants for select to authenticated using (author_id = (select auth.uid()));
create policy "offers on your post or from you" on public.want_offers for select to authenticated
  using (host_id = (select auth.uid()) or exists (select 1 from public.room_wants w where w.id = want_id and w.author_id = (select auth.uid())));

-- The date a post stops showing.
create or replace function private.want_until(w public.room_wants) returns timestamptz
language sql stable set search_path = '' as $$
  select least(w.expires_at, coalesce((w.move_in + 7)::timestamptz, w.expires_at))
$$;

-- Post (or replace) what you need.
create or replace function public.post_want(
  p_area text, p_lat double precision, p_lng double precision, p_zone smallint default null,
  p_budget int default null, p_move_in date default null, p_months int default null, p_weeks int default null,
  p_room public.room_kind default null, p_pref public.share_pref default 'mixed_ok', p_note text default null
) returns public.room_wants
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.room_wants;
begin
  if v_uid is null then perform private.fail('auth', 'Sign up to post what you need.'); end if;
  perform private.assert_active(v_uid);
  if private.setting_bool('require_verification_to_request', true)
     and not (select is_verified from public.profiles where id = v_uid) then
    perform private.fail('verify', 'Verify your ID to post what you need.');
  end if;
  if p_lat not between 8.3 and 9.5 or p_lng not between 6.7 and 7.7 then perform private.fail('area', 'Pick an area in Abuja.'); end if;
  if p_move_in is not null and p_move_in < current_date then perform private.fail('date', 'Pick a move-in date from today on.'); end if;
  if p_months is not null and p_weeks is not null then perform private.fail('length', 'Pick weeks or months.'); end if;

  update public.room_wants set status = 'closed' where author_id = v_uid and status = 'open';
  insert into public.room_wants (author_id, area_label, lat, lng, zone_id, budget_max, move_in, months, weeks, room_kind, pref, note)
  values (v_uid, trim(p_area), p_lat, p_lng, p_zone, p_budget, p_move_in, p_months, p_weeks, p_room, coalesce(p_pref, 'mixed_ok'),
          nullif(left(trim(p_note), 200), ''))
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.close_want(p_want uuid) returns void
language sql security definer set search_path = '' as $$
  update public.room_wants set status = 'closed' where id = p_want and author_id = auth.uid() and status = 'open'
$$;

-- Booking a room closes your post.
create or replace function private.close_want_on_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update public.room_wants set status = 'booked' where author_id = new.tenant_id and status = 'open';
  end if;
  return null;
end $$;
create trigger close_want_on_booking after update of status on public.bookings
  for each row execute function private.close_want_on_booking();

-- "Corpers looking": open posts, newest first; with p_listing, sorted by how well that room fits.
create or replace function public.want_feed(p_listing uuid default null, p_limit int default 50)
returns table (
  id uuid, first_name text, batch_label text, verified boolean, area_label text, budget_max int, move_in date,
  months smallint, weeks smallint, room_kind public.room_kind, pref public.share_pref, note text, created_at timestamptz,
  minutes int, fits_budget boolean, fits_household boolean, offered boolean, mine boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.listings;
begin
  if auth.uid() is null then perform private.fail('auth', 'Sign in to see who''s looking.'); end if;
  if p_listing is not null then
    select * into l from public.listings x where x.id = p_listing and x.host_id = auth.uid();
  end if;
  return query
  select w.id, p.first_name,
         case when b.id is null then null else 'Batch ' || b.batch || ' ' || b.year end,
         p.is_verified, w.area_label, w.budget_max, w.move_in, w.months, w.weeks, w.room_kind, w.pref, w.note, w.created_at,
         case when l.id is not null and l.area_lat is not null then public.estimate_minutes(l.area_lat, l.area_lng, w.lat, w.lng) end,
         case when l.id is null or w.budget_max is null then null else l.monthly_total <= w.budget_max end,
         case when l.id is null then null
              else w.pref = 'mixed_ok' or (w.pref = 'women_only' and l.household = 'women') or (w.pref = 'men_only' and l.household = 'men') end,
         exists (select 1 from public.want_offers o where o.want_id = w.id and o.host_id = auth.uid()),
         w.author_id = auth.uid()
  from public.room_wants w
  join public.profiles p on p.id = w.author_id
  left join public.profile_private pp on pp.user_id = w.author_id
  left join public.nysc_batches b on b.id = pp.batch_id
  where w.status = 'open' and private.want_until(w) > now() and p.suspended_at is null
  order by
    case when l.id is null then 0
         else (case when (w.pref = 'mixed_ok' or (w.pref = 'women_only' and l.household = 'women') or (w.pref = 'men_only' and l.household = 'men')) then 0 else 100 end)
            + (case when w.budget_max is null or l.monthly_total <= w.budget_max then 0 else 40 end)
            + coalesce(public.estimate_minutes(l.area_lat, l.area_lng, w.lat, w.lng), 60) end,
    w.created_at desc
  limit least(p_limit, 100);
end $$;

-- Host offers one of their live rooms: a chat opens with the room attached.
create or replace function public.offer_room(p_want uuid, p_listing uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  w public.room_wants;
  l public.listings;
  v_conv uuid;
begin
  if v_uid is null then perform private.fail('auth', 'Sign in first.'); end if;
  perform private.assert_active(v_uid);
  select * into w from public.room_wants where id = p_want;
  if w.id is null or w.status <> 'open' or private.want_until(w) <= now() then perform private.fail('closed', 'This post is closed.'); end if;
  select * into l from public.listings where id = p_listing and host_id = v_uid;
  if l.id is null then perform private.fail('not_found', 'Room not found.'); end if;
  if l.status <> 'live' then perform private.fail('not_live', 'Only live rooms can be offered. Finish and publish it first.'); end if;
  if w.author_id = v_uid then perform private.fail('own', 'This is your own post.'); end if;
  if exists (select 1 from public.blocks where (blocker_id = w.author_id and blocked_id = v_uid) or (blocker_id = v_uid and blocked_id = w.author_id)) then
    perform private.fail('blocked', 'You can''t offer to this person.');
  end if;
  if (select count(*) from public.want_offers where host_id = v_uid and created_at > now() - interval '1 day')
     >= private.setting_int('max_offers_per_day', 20) then
    perform private.fail('limit', 'You''ve sent a lot of offers today. Try again tomorrow.');
  end if;

  v_conv := private.conversation_for(l.id, w.author_id, v_uid);
  insert into public.want_offers (want_id, listing_id, host_id, conversation_id) values (w.id, l.id, v_uid, v_conv)
  on conflict (want_id, listing_id) do nothing;
  perform private.post_system(v_conv,
    (select first_name from public.profiles where id = v_uid) || ' offered their room in ' || coalesce(nullif(l.area_name, ''), 'Abuja')
      || ' · ₦' || to_char(l.monthly_total, 'FM999,999,990') || ' a month',
    jsonb_build_object('type', 'offer', 'listing_id', l.id, 'want_id', w.id));
  return v_conv;
end $$;

-- For the corper: the post itself, how many rooms already match, and offers so far.
create or replace function public.my_want()
returns table (id uuid, area_label text, budget_max int, move_in date, months smallint, weeks smallint,
  room_kind public.room_kind, pref public.share_pref, note text, created_at timestamptz, until timestamptz,
  matches int, offers int)
language sql stable security definer set search_path = '' as $$
  select w.id, w.area_label, w.budget_max, w.move_in, w.months, w.weeks, w.room_kind, w.pref, w.note, w.created_at,
         private.want_until(w),
         (select count(*)::int from public.find_rooms(
            p_mode => 'ppa', p_move_in => w.move_in, p_lat => w.lat, p_lng => w.lng, p_zone => w.zone_id,
            p_budget_max => w.budget_max, p_pref => w.pref, p_room => w.room_kind,
            p_stay => case when w.weeks is not null then 'weeks' else 'any' end, p_max_minutes => 30) f where f.exact),
         (select count(*)::int from public.want_offers o where o.want_id = w.id)
  from public.room_wants w
  where w.author_id = auth.uid() and w.status = 'open' and private.want_until(w) > now()
  order by w.created_at desc limit 1
$$;

-- Admin: where corpers are looking vs rooms listed there.
create or replace function public.admin_demand()
returns table (zone text, wants int, avg_budget int, live_rooms int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select z.name, count(w.id)::int, avg(w.budget_max)::int,
         (select count(*)::int from public.listings l where l.status = 'live'
            and public.distance_m(l.area_lat, l.area_lng, z.lat, z.lng) < 3000)
  from public.room_wants w
  join public.ppa_zones z on z.id = coalesce(w.zone_id,
    (select z2.id from public.ppa_zones z2 order by public.distance_m(z2.lat, z2.lng, w.lat, w.lng) limit 1))
  where w.status = 'open' and private.want_until(w) > now()
  group by z.id, z.name, z.lat, z.lng
  order by count(w.id) desc
  limit 50;
end $$;

insert into public.settings (key, value) values ('max_offers_per_day', '20') on conflict (key) do nothing;

do $$
declare f text;
begin
  foreach f in array array[
    'public.post_want(text, double precision, double precision, smallint, int, date, int, int, public.room_kind, public.share_pref, text)',
    'public.close_want(uuid)', 'public.want_feed(uuid, int)', 'public.offer_room(uuid, uuid)', 'public.my_want()', 'public.admin_demand()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
