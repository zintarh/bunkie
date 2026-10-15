-- Search that ranks instead of only filtering.
--  * Dealbreakers hide a room: wrong household, camp rules, or far beyond what was asked
--    (budget, commute, move-in date, beyond the allowances below).
--  * Everything else is a near miss: the room is still returned with the reasons it isn't exact,
--    so a search never dead-ends, and close matches stay close to where the person searched.
--  * Each room gets a 0-100 match score; exact matches come first, then near misses, best score first.
--    (The app adds personal bunkie fit on the phone, so results can be cached per search.)

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
  free_from date, match_score int, exact boolean, misses jsonb
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
      -- Dealbreakers.
      and (p_pref = 'mixed_ok' or (p_pref = 'women_only' and l.household = 'women') or (p_pref = 'men_only' and l.household = 'men'))
      and (p_mode <> 'camp' or (l.open_to_camp and (l.min_months <= 3 or l.open_to_short)))
  ),
  checked as (
    select b.*, (select want from params) as want,
      jsonb_build_array(
        case when p_budget_max is not null and b.price_basis > p_budget_max
             then jsonb_build_object('kind', 'over_budget', 'by', b.price_basis - p_budget_max) end,
        case when b.free_from is not null and b.free_from > (select want from params)
             then jsonb_build_object('kind', 'later', 'days', b.free_from - (select want from params), 'on', b.free_from) end,
        case when p_max_minutes is not null and b.commute_min > p_max_minutes
             then jsonb_build_object('kind', 'farther', 'minutes', b.commute_min) end,
        case when p_room is not null and b.room_kind <> p_room
             then jsonb_build_object('kind', 'room', 'is', b.room_kind) end,
        case when p_stay = 'weeks' and not b.open_to_short then jsonb_build_object('kind', 'no_short') end,
        case when p_stay = 'short' and b.min_months > 3 and not b.open_to_short
             then jsonb_build_object('kind', 'min_stay', 'months', b.min_months) end,
        case when p_stay = 'long' and b.max_months < 6 then jsonb_build_object('kind', 'max_stay', 'months', b.max_months) end
      ) as raw_misses
    from base b, params
    -- Beyond the allowances it isn't a near miss any more.
    where (p_budget_max is null or b.price_basis <= p_budget_max + params.budget_slack)
      and (b.free_from is null or b.free_from <= params.want + params.later_slack)
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
           + case when s.free_from is null or s.free_from <= s.want then 5 else 0 end
           + 5 * exp(-extract(epoch from now() - s.published_at) / 86400 / 30.0)
           + case when s.photo_count >= 6 then 2 else 0 end
           - 8 * jsonb_array_length(s.miss_list)
         )))::int,
         jsonb_array_length(s.miss_list) = 0,
         s.miss_list
  from scored s
  join public.profiles pr on pr.id = s.host_id
  left join public.bunkie_answers a on a.user_id = s.host_id and a.approved_at is not null
  ) r (id, area_name, area_lat, area_lng, room_kind, bath_kind, furnished, household, open_to_camp, min_months,
       max_months, available_from, monthly_total, total_varies, deposit, pay_schedule, open_to_short, weekly_price,
       photo_count, cover_path, host_id, host_first_name, host_photo_path, host_verified, host_corper, host_answers,
       commute_min, ease_min, published_at, free_from, match_score, exact, misses)
  order by r.exact desc, r.match_score desc, r.published_at desc
  limit least(p_limit, 60)
$$;

grant execute on function public.find_rooms(text, date, double precision, double precision, smallint, int,
  public.share_pref, public.room_kind, text, int, int) to anon, authenticated;
