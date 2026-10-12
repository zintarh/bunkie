-- Listing lifecycle and the cached search behind Explore.

-- Rough minutes by road when the precomputed commute isn't there yet (about 2.6 min/km + 6 min).
create or replace function public.estimate_minutes(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns int language sql immutable parallel safe as $$
  select (public.distance_m(lat1, lng1, lat2, lng2) / 1000.0 * 2.6 + 6)::int
$$;

-- Host starts a listing. Marks them as a host so verification asks for proof of address.
create or replace function public.start_listing() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then perform private.fail('auth', 'Log in to list a room.'); end if;
  select id into v_id from public.listings where host_id = v_uid and status = 'draft' order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;
  update public.profiles set is_host = true where id = v_uid;
  insert into public.listings (host_id) values (v_uid) returning id into v_id;
  return v_id;
end $$;

-- What's still missing before a listing can go live. Empty array means ready.
create or replace function public.listing_missing(p_listing uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when loc.listing_id is null then 'location' end,
    case when (select count(distinct p.shot) from public.listing_photos p
               where p.listing_id = l.id and p.shot in ('bedroom', 'bathroom', 'kitchen', 'meter', 'entrance')) < 5
         then 'photos' end,
    case when coalesce(l.rent_monthly, 0) <= 0 then 'rent' end,
    case when l.room_kind is null then 'room_kind' end,
    case when l.household is null then 'household' end,
    case when l.available_from is null then 'available_from' end,
    case when not l.allowed_to_share then 'permission' end,
    case when not exists (select 1 from public.bunkie_answers a where a.user_id = l.host_id) then 'bunkie_questions' end,
    case when private.setting_bool('require_host_verification', true)
              and not (select pr.is_verified from public.profiles pr where pr.id = l.host_id) then 'verification' end,
    case when private.setting_bool('require_payout_account', true)
              and not exists (select 1 from public.host_payout_accounts h where h.host_id = l.host_id) then 'payout' end
  ], null)
  from public.listings l
  left join public.listing_locations loc on loc.listing_id = l.id
  where l.id = p_listing and l.host_id = auth.uid()
$$;

create or replace function public.publish_listing(p_listing uuid) returns public.listings
language plpgsql security definer set search_path = '' as $$
declare
  v_missing text[];
  v_loc public.listing_locations;
  v_flagged boolean;
  v_row public.listings;
begin
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

create or replace function public.pause_listing(p_listing uuid, p_paused boolean) returns public.listings
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.listings;
begin
  update public.listings set status = (case when p_paused then 'paused' else 'live' end)::public.listing_status
  where id = p_listing and host_id = auth.uid() and status in ('live', 'paused')
  returning * into v_row;
  if v_row.id is null then perform private.fail('not_allowed', 'Only live listings can be paused.'); end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Search. Takes only filters (no user id) so the edge can cache it per filter set.
-- ---------------------------------------------------------------------------
create or replace function public.search_rooms(
  p_mode text default 'any',              -- 'camp' | 'ppa' | 'any'
  p_move_in date default null,            -- camp mode: the camp exit date
  p_zone smallint default null,           -- PPA zone
  p_ppa_lat double precision default null,
  p_ppa_lng double precision default null,
  p_price_min int default 0,
  p_price_max int default 10000000,
  p_pref public.share_pref default 'mixed_ok',
  p_room public.room_kind default null,
  p_stay text default 'any',              -- 'short' (1-3) | 'long' (6-12) | 'any'
  p_max_minutes int default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  id uuid, area_name text, area_lat double precision, area_lng double precision,
  room_kind public.room_kind, bath_kind public.bath_kind, furnished boolean, household public.household,
  open_to_camp boolean, min_months smallint, max_months smallint, available_from date,
  monthly_total int, total_varies boolean, deposit int, pay_schedule public.pay_schedule,
  photo_count smallint, cover_path text,
  host_id uuid, host_first_name text, host_photo_path text, host_verified boolean,
  host_answers jsonb, commute_min int, ease_min int, published_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  with base as (
    select l.*,
      case
        when p_zone is not null then coalesce(
          (select cm.minutes from public.commute_minutes cm where cm.listing_id = l.id and cm.zone_id = p_zone),
          (select public.estimate_minutes(l.area_lat, l.area_lng, z.lat, z.lng) from public.ppa_zones z where z.id = p_zone))
        when p_ppa_lat is not null then public.estimate_minutes(l.area_lat, l.area_lng, p_ppa_lat, p_ppa_lng)
      end as commute_min,
      coalesce((select avg(cm.minutes)::int from public.commute_minutes cm where cm.listing_id = l.id),
               public.estimate_minutes(l.area_lat, l.area_lng, 9.0579, 7.4951)) as ease_min   -- Central Area
    from public.listings l
    where l.status = 'live'
      and l.monthly_total between p_price_min and p_price_max
      and (p_room is null or l.room_kind = p_room)
      and (p_pref = 'mixed_ok' or (p_pref = 'women_only' and l.household = 'women') or (p_pref = 'men_only' and l.household = 'men'))
      and (p_stay = 'any' or (p_stay = 'short' and l.min_months <= 3) or (p_stay = 'long' and l.max_months >= 6))
      and (p_mode <> 'camp' or (l.open_to_camp and l.min_months <= 3))
      and (p_move_in is null or l.available_from is null or l.available_from <= p_move_in)
      and (p_move_in is null or not exists (
            select 1 from public.bookings b
            where b.listing_id = l.id and b.status in ('paid', 'moved_in', 'active', 'ending')
              and b.stay @> p_move_in))
  )
  select b.id, b.area_name, b.area_lat, b.area_lng, b.room_kind, b.bath_kind, b.furnished, b.household,
         b.open_to_camp, b.min_months, b.max_months, b.available_from, b.monthly_total, b.total_varies,
         b.deposit, b.pay_schedule, b.photo_count, b.cover_path,
         b.host_id, pr.first_name, pr.photo_path, pr.is_verified,
         case when a.user_id is null then null
              else jsonb_build_object('sleep', a.sleep, 'guests', a.guests, 'cooking', a.cooking,
                                      'cleaning', a.cleaning, 'noise', a.noise) end,
         b.commute_min, b.ease_min, b.published_at
  from base b
  join public.profiles pr on pr.id = b.host_id
  left join public.bunkie_answers a on a.user_id = b.host_id and a.approved_at is not null
  where p_max_minutes is null or b.commute_min is null or b.commute_min <= p_max_minutes
  order by
    case when p_mode = 'camp' then b.ease_min end nulls last,
    case when p_mode = 'ppa' then b.commute_min end nulls last,
    b.published_at desc
  limit least(p_limit, 60) offset p_offset
$$;

-- Worker stores commute minutes after calling the routes API.
create or replace function public.sys_store_commute(p_listing uuid, p_rows jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.commute_minutes (listing_id, zone_id, minutes, computed_at)
  select p_listing, (r ->> 'zone_id')::smallint, (r ->> 'minutes')::smallint, now()
  from jsonb_array_elements(p_rows) r
  on conflict (listing_id, zone_id) do update set minutes = excluded.minutes, computed_at = now()
$$;

revoke execute on function public.sys_store_commute(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sys_store_commute(uuid, jsonb) to service_role;

revoke execute on function public.start_listing(), public.listing_missing(uuid), public.publish_listing(uuid),
  public.pause_listing(uuid, boolean) from public, anon;
grant execute on function public.start_listing(), public.listing_missing(uuid), public.publish_listing(uuid),
  public.pause_listing(uuid, boolean) to authenticated;
grant execute on function public.search_rooms(text, date, smallint, double precision, double precision, int, int,
  public.share_pref, public.room_kind, text, int, int, int) to anon, authenticated;
