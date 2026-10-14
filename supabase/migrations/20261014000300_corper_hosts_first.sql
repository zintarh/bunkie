-- Corper hosts first, always (was: first only among rooms with a similar commute).

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
  host_id uuid, host_first_name text, host_photo_path text, host_verified boolean, host_corper public.corper_status,
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
         case when pr.corper_verified then pr.corper_status end,
         case when a.user_id is null then null
              else jsonb_build_object('sleep', a.sleep, 'guests', a.guests, 'cooking', a.cooking,
                                      'cleaning', a.cleaning, 'noise', a.noise) end,
         b.commute_min, b.ease_min, b.published_at
  from base b
  join public.profiles pr on pr.id = b.host_id
  left join public.bunkie_answers a on a.user_id = b.host_id and a.approved_at is not null
  where p_max_minutes is null or b.commute_min is null or b.commute_min <= p_max_minutes
  -- Verified corp member hosts (serving or served) always come first, so new corpers land with
  -- someone who has been through NYSC. Within each group, the shortest commute first.
  order by
    case when pr.corper_verified and pr.corper_status in ('serving', 'served') then 0 else 1 end,
    case when p_mode = 'camp' then b.ease_min end nulls last,
    case when p_mode = 'ppa' then b.commute_min end nulls last,
    b.published_at desc
  limit least(p_limit, 60) offset p_offset
$$;
