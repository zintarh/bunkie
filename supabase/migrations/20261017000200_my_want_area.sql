-- my_want also returns the area's coordinates, so "Change it" can refill the form.
drop function public.my_want();
create function public.my_want()
returns table (id uuid, area_label text, lat double precision, lng double precision, zone_id smallint, budget_max int, move_in date,
  months smallint, weeks smallint, room_kind public.room_kind, pref public.share_pref, note text, created_at timestamptz, until timestamptz,
  matches int, offers int)
language sql stable security definer set search_path = '' as $$
  select w.id, w.area_label, w.lat, w.lng, w.zone_id, w.budget_max, w.move_in, w.months, w.weeks, w.room_kind, w.pref, w.note, w.created_at,
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
revoke execute on function public.my_want() from public, anon;
grant execute on function public.my_want() to authenticated;
