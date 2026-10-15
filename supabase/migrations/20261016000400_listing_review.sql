-- Every new listing waits for the team: publish puts it 'in_review'; an admin approves it (live) or
-- sends it back as a draft with a note for the host. Once approved, the host can pause and resume freely.

alter table public.listings
  add column approved_at timestamptz,
  add column approved_by uuid,
  add column submitted_at timestamptz,
  add column review_note text;            -- what the team asked the host to change

-- Rooms already live were approved by being live.
update public.listings set approved_at = coalesce(published_at, now()) where status in ('live', 'paused');

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

  -- First time: the team approves it before it goes live. Already approved (e.g. republished after a
  -- pause or a fix): straight back to live.
  update public.listings set
    status = (case when approved_at is not null and not v_flagged then 'live' else 'in_review' end)::public.listing_status,
    review_note = null,
    submitted_at = now(),
    area_lat = round((v_loc.lat / 0.003)::numeric) * 0.003,
    area_lng = round((v_loc.lng / 0.003)::numeric) * 0.003
  where id = p_listing
  returning * into v_row;

  perform private.enqueue('commute', jsonb_build_object('listing_id', p_listing));
  return v_row;
end $$;

drop function public.admin_listings(public.listing_status);
create or replace function public.admin_listings(p_status public.listing_status default 'in_review')
returns table (id uuid, area_name text, status public.listing_status, host_id uuid, host_name text, monthly_total int,
  address_line text, lat double precision, lng double precision, photos jsonb, published_at timestamptz,
  submitted_at timestamptz, review_note text, host_verified boolean, room_kind public.room_kind)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select l.id, l.area_name, l.status, l.host_id, h.first_name, l.monthly_total, loc.address_line, loc.lat, loc.lng,
         coalesce((select jsonb_agg(jsonb_build_object('path', p.path, 'shot', p.shot, 'distance_m', p.distance_m,
                                                       'flagged', p.flagged, 'taken_at', p.taken_at) order by p.position)
                   from public.listing_photos p where p.listing_id = l.id), '[]'),
         l.published_at, l.submitted_at, l.review_note, h.is_verified, l.room_kind
  from public.listings l
  join public.profiles h on h.id = l.host_id
  left join public.listing_locations loc on loc.listing_id = l.id
  -- "In review" also shows older listings held for photos far from the pin.
  where l.status = p_status or (p_status = 'in_review' and l.status = 'flagged')
  order by coalesce(l.submitted_at, l.updated_at)
  limit 200;
end $$;
revoke execute on function public.admin_listings(public.listing_status) from public, anon;
grant execute on function public.admin_listings(public.listing_status) to authenticated;

create or replace function public.admin_listing_decision(p_listing uuid, p_outcome text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_outcome = 'approve' then
    update public.listing_photos set flagged = false where listing_id = p_listing;
    update public.listings set status = 'live', published_at = coalesce(published_at, now()),
      approved_at = now(), approved_by = auth.uid(), review_note = null
    where id = p_listing;
  elsif p_outcome = 'changes' then
    -- Back to the host as a draft, with what to fix.
    if nullif(trim(p_note), '') is null then perform private.fail('note', 'Say what the host should change.'); end if;
    update public.listings set status = 'draft', review_note = trim(p_note), approved_at = null where id = p_listing;
  elsif p_outcome = 'pause' then
    update public.listings set status = 'paused' where id = p_listing;
  elsif p_outcome = 'remove' then
    update public.listings set status = 'archived' where id = p_listing;
  else
    perform private.fail('outcome', 'Pick an outcome.');
  end if;
  perform private.audit('listing_' || p_outcome, 'listing', p_listing::text, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'reports', (select count(*) from public.reports where status <> 'closed'),
    'chats', (select count(distinct conversation_id) from private.chat_flags where reviewed_at is null),
    'listings', (select count(*) from public.listings where status in ('in_review', 'flagged')),
    'verifications', (select count(*) from private.verifications where status = 'failed' and created_at > now() - interval '30 days'),
    'suspended', (select count(*) from public.profiles where suspended_at is not null),
    'live_listings', (select count(*) from public.listings where status = 'live'),
    'open_bookings', (select count(*) from public.bookings where status not in ('closed', 'completed')),
    'people', (select count(*) from public.profiles)
  );
end $$;
