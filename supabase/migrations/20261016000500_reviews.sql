-- Reviews after a stay, Airbnb-style.
--  * The corper reviews the room and host (overall, accuracy, cleanliness, host); the host reviews the
--    corper (overall, house rules, cleanliness). 1-5 stars each, optional comment.
--  * Open from move-out until 14 days after it. Double-blind: a review stays hidden until both have
--    reviewed or the window closes, so nobody writes theirs in reaction to the other's.
--  * Published reviews feed the listing's and the person's average, shown on cards and requests,
--    and nudge search ranking.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  author_id uuid references public.profiles (id) on delete set null,
  subject_id uuid not null references public.profiles (id) on delete cascade,
  direction text not null check (direction in ('of_host', 'of_tenant')),
  overall smallint not null check (overall between 1 and 5),
  accuracy smallint check (accuracy between 1 and 5),
  cleanliness smallint check (cleanliness between 1 and 5),
  communication smallint check (communication between 1 and 5),
  rules smallint check (rules between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  published_at timestamptz,
  removed_at timestamptz,                    -- taken down by the team
  created_at timestamptz not null default now(),
  unique (booking_id, direction)
);
create index reviews_listing_idx on public.reviews (listing_id, published_at desc) where published_at is not null and removed_at is null;
create index reviews_subject_idx on public.reviews (subject_id, published_at desc) where published_at is not null and removed_at is null;
create index reviews_pending_idx on public.reviews (booking_id) where published_at is null;

alter table public.listings add column rating_avg numeric(2, 1), add column rating_count int not null default 0;
alter table public.profiles add column rating_avg numeric(2, 1), add column rating_count int not null default 0;

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
create policy "published, or your own" on public.reviews for select
  using ((published_at is not null and removed_at is null) or author_id = (select auth.uid()));

-- Recomputes the averages that cards, requests and search use.
create or replace function private.refresh_ratings(p_listing uuid, p_subject uuid) returns void
language sql security definer set search_path = '' as $$
  update public.listings l set
    rating_count = r.n, rating_avg = case when r.n > 0 then round(r.avg, 1) end
  from (select count(*)::int n, avg(overall) avg from public.reviews
        where listing_id = p_listing and direction = 'of_host' and published_at is not null and removed_at is null) r
  where l.id = p_listing;
  update public.profiles p set
    rating_count = r.n, rating_avg = case when r.n > 0 then round(r.avg, 1) end
  from (select count(*)::int n, avg(overall) avg from public.reviews
        where subject_id = p_subject and published_at is not null and removed_at is null) r
  where p.id = p_subject;
$$;

create or replace function private.publish_reviews(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.reviews;
begin
  for r in update public.reviews set published_at = now()
           where booking_id = p_booking and published_at is null returning * loop
    perform private.refresh_ratings(r.listing_id, r.subject_id);
  end loop;
end $$;

-- When this booking can be reviewed (null: not open, or closed).
create or replace function private.review_window(b public.bookings) returns boolean
language sql stable set search_path = '' as $$
  select b.status in ('moved_out', 'completed')
     and now() < (b.move_out + interval '14 days')
$$;

create or replace function public.submit_review(
  p_booking uuid, p_overall int, p_accuracy int default null, p_cleanliness int default null,
  p_communication int default null, p_rules int default null, p_comment text default null
) returns public.reviews
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  b public.bookings;
  v_dir text;
  v_row public.reviews;
begin
  if v_uid is null then perform private.fail('auth', 'Sign in to leave a review.'); end if;
  select * into b from public.bookings where id = p_booking;
  if b.id is null or v_uid not in (b.tenant_id, b.host_id) then perform private.fail('not_found', 'Booking not found.'); end if;
  if not private.review_window(b) then perform private.fail('closed', 'Reviews open when the stay ends and close 14 days later.'); end if;
  v_dir := case when v_uid = b.tenant_id then 'of_host' else 'of_tenant' end;
  if p_overall not between 1 and 5 then perform private.fail('stars', 'Pick 1 to 5 stars.'); end if;
  if v_dir = 'of_host' and (p_accuracy is null or p_cleanliness is null or p_communication is null) then
    perform private.fail('stars', 'Rate accuracy, cleanliness and the host.');
  end if;
  if v_dir = 'of_tenant' and (p_rules is null or p_cleanliness is null) then
    perform private.fail('stars', 'Rate house rules and cleanliness.');
  end if;

  insert into public.reviews (booking_id, listing_id, author_id, subject_id, direction, overall, accuracy, cleanliness,
                              communication, rules, comment)
  values (b.id, b.listing_id, v_uid, case when v_dir = 'of_host' then b.host_id else b.tenant_id end, v_dir, p_overall,
          case when v_dir = 'of_host' then p_accuracy end, p_cleanliness,
          case when v_dir = 'of_host' then p_communication end, case when v_dir = 'of_tenant' then p_rules end,
          nullif(left(trim(p_comment), 1000), ''))
  returning * into v_row;

  -- Both in: both go public now.
  if (select count(*) from public.reviews where booking_id = b.id) = 2 then
    perform private.publish_reviews(b.id);
    select * into v_row from public.reviews where id = v_row.id;
  end if;
  return v_row;
exception
  when unique_violation then
    perform private.fail('done', 'You''ve already reviewed this stay.');
end $$;

-- Daily: windows that closed with only one review publish it anyway.
create or replace function public.sys_publish_due_reviews() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_b uuid;
  v_n int := 0;
begin
  for v_b in select distinct r.booking_id from public.reviews r join public.bookings b on b.id = r.booking_id
             where r.published_at is null and now() >= b.move_out + interval '14 days' loop
    perform private.publish_reviews(v_b);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.sys_publish_due_reviews() from public, anon, authenticated;
grant execute on function public.sys_publish_due_reviews() to service_role;

-- Room page: the room's published reviews, newest first.
create or replace function public.listing_reviews(p_listing uuid, p_limit int default 20)
returns table (id uuid, author_name text, author_photo text, overall smallint, accuracy smallint, cleanliness smallint,
  communication smallint, comment text, published_at timestamptz, stay_label text)
language sql stable security definer set search_path = '' as $$
  select r.id, a.first_name, a.photo_path, r.overall, r.accuracy, r.cleanliness, r.communication, r.comment,
         r.published_at, case when b.weeks is not null then b.weeks || ' week stay' else b.months || ' month stay' end
  from public.reviews r
  left join public.profiles a on a.id = r.author_id
  join public.bookings b on b.id = r.booking_id
  where r.listing_id = p_listing and r.direction = 'of_host' and r.published_at is not null and r.removed_at is null
  order by r.published_at desc
  limit least(p_limit, 50)
$$;
grant execute on function public.listing_reviews(uuid, int) to anon, authenticated;

-- What hosts see about a corper who requests: their rating and recent host reviews.
create or replace function public.person_reviews(p_person uuid, p_limit int default 5)
returns table (author_name text, overall smallint, rules smallint, cleanliness smallint, comment text, published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.first_name, r.overall, r.rules, r.cleanliness, r.comment, r.published_at
  from public.reviews r left join public.profiles a on a.id = r.author_id
  where r.subject_id = p_person and r.direction = 'of_tenant' and r.published_at is not null and r.removed_at is null
  order by r.published_at desc
  limit least(p_limit, 20)
$$;
revoke execute on function public.person_reviews(uuid, int) from public, anon;
grant execute on function public.person_reviews(uuid, int) to authenticated;

-- Admin: take down an abusive review (it stops counting).
create or replace function public.admin_remove_review(p_review uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.reviews;
begin
  perform private.require_admin();
  update public.reviews set removed_at = now() where id = p_review returning * into r;
  if r.id is null then perform private.fail('not_found', 'Review not found.'); end if;
  perform private.refresh_ratings(r.listing_id, r.subject_id);
  perform private.audit('remove_review', 'review', p_review::text, jsonb_build_object('reason', p_reason));
end $$;
revoke execute on function public.admin_remove_review(uuid, text) from public, anon;
grant execute on function public.admin_remove_review(uuid, text) to authenticated;

revoke execute on function public.submit_review(uuid, int, int, int, int, int, text) from public, anon;
grant execute on function public.submit_review(uuid, int, int, int, int, int, text) to authenticated;

drop function public.find_rooms(text, date, double precision, double precision, smallint, int,
  public.share_pref, public.room_kind, text, int, int);
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
  free_from date, match_score int, exact boolean, misses jsonb, inspection_fee int, being_viewed_until timestamptz,
  rating_avg numeric, rating_count int
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
             -- Ratings: up to +/-6, pulled toward 4 stars so one review can't swing it.
           + greatest(-6, least(6, ((coalesce(s.rating_avg, 4) * s.rating_count + 4 * 2) / (s.rating_count + 2) - 4) * 6))
           - 8 * jsonb_array_length(s.miss_list)
         )))::int,
         jsonb_array_length(s.miss_list) = 0,
         s.miss_list,
         s.inspection_fee,
         private.listing_hold(s.id),
         s.rating_avg, s.rating_count
  from scored s
  join public.profiles pr on pr.id = s.host_id
  left join public.bunkie_answers a on a.user_id = s.host_id and a.approved_at is not null
  ) r (id, area_name, area_lat, area_lng, room_kind, bath_kind, furnished, household, open_to_camp, min_months,
       max_months, available_from, monthly_total, total_varies, deposit, pay_schedule, open_to_short, weekly_price,
       photo_count, cover_path, host_id, host_first_name, host_photo_path, host_verified, host_corper, host_answers,
       commute_min, ease_min, published_at, free_from, match_score, exact, misses, inspection_fee, being_viewed_until,
       rating_avg, rating_count)
  order by r.exact desc, r.match_score desc, r.published_at desc
  limit least(p_limit, 60)
$$;
grant execute on function public.find_rooms(text, date, double precision, double precision, smallint, int,
  public.share_pref, public.room_kind, text, int, int) to anon, authenticated;
