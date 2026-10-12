-- Access rules. Every public table has RLS on. Writes to bookings and money tables
-- only happen through security-definer functions or Edge Functions with the service key.

-- The private schema is never reachable from the API.
alter default privileges in schema private revoke execute on functions from public;
revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- Start every public table closed, then open what each role needs.
revoke all on all tables in schema public from anon, authenticated;

alter table public.settings enable row level security;
alter table public.nysc_batches enable row level security;
alter table public.ppa_zones enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.bunkie_answers enable row level security;
alter table public.listings enable row level security;
alter table public.listing_locations enable row level security;
alter table public.listing_photos enable row level security;
alter table public.listing_costs enable row level security;
alter table public.house_rules enable row level security;
alter table public.commute_minutes enable row level security;
alter table public.saved_rooms enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.agreement_versions enable row level security;
alter table public.host_payout_accounts enable row level security;
alter table public.payments enable row level security;
alter table public.payouts enable row level security;
alter table public.refunds enable row level security;
alter table public.check_ins enable row level security;
alter table public.condition_photos enable row level security;
alter table public.ratings enable row level security;
alter table public.reports enable row level security;

-- Helper: is the caller a party to this booking? Security definer so policies stay cheap.
create or replace function private.is_party(p_booking uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking and (select auth.uid()) in (b.tenant_id, b.host_id)
  )
$$;

create or replace function private.owns_listing(p_listing uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.listings l where l.id = p_listing and l.host_id = (select auth.uid()))
$$;

create or replace function private.listing_visible(p_listing uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.listings l
    where l.id = p_listing and (l.status = 'live' or l.host_id = (select auth.uid()))
  )
$$;

grant usage on schema private to anon, authenticated;
grant execute on function private.is_party(uuid), private.owns_listing(uuid), private.listing_visible(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reference data: readable by everyone.
-- ---------------------------------------------------------------------------
grant select on public.settings, public.nysc_batches, public.ppa_zones to anon, authenticated;
create policy "read" on public.settings for select using (true);
create policy "read" on public.nysc_batches for select using (true);
create policy "read" on public.ppa_zones for select using (true);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
grant select on public.profiles to anon, authenticated;
grant update (first_name, photo_path) on public.profiles to authenticated;
create policy "read" on public.profiles for select using (true);
create policy "update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.profile_private to authenticated;
grant update (last_name, phone, whatsapp_opt_in, share_pref, nysc_stage, batch_id, state_code,
              ppa_label, ppa_lat, ppa_lng, ppa_zone_id)
  on public.profile_private to authenticated;
create policy "own" on public.profile_private for select to authenticated using (user_id = (select auth.uid()));
create policy "update own" on public.profile_private for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.bunkie_answers to anon, authenticated;
grant insert, update on public.bunkie_answers to authenticated;
create policy "read" on public.bunkie_answers for select using (true);
create policy "insert own" on public.bunkie_answers for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own" on public.bunkie_answers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Listings. Status, totals and photo counts are set by functions and triggers only.
-- ---------------------------------------------------------------------------
grant select on public.listings to anon, authenticated;
grant insert (host_id, area_name, room_kind, bath_kind, furnished, household, open_to_camp, min_months, max_months,
              pay_schedule, available_from, rent_monthly, deposit, early_leave_notice_days, redeploy_refund,
              ask_leave_notice_days, allowed_to_share)
  on public.listings to authenticated;
grant update (area_name, room_kind, bath_kind, furnished, household, open_to_camp, min_months, max_months,
              pay_schedule, available_from, rent_monthly, deposit, early_leave_notice_days, redeploy_refund,
              ask_leave_notice_days, allowed_to_share)
  on public.listings to authenticated;
grant delete on public.listings to authenticated;
create policy "read live or own" on public.listings for select
  using (status = 'live' or host_id = (select auth.uid()));
create policy "insert own" on public.listings for insert to authenticated with check (host_id = (select auth.uid()));
create policy "update own" on public.listings for update to authenticated
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy "delete own draft" on public.listings for delete to authenticated
  using (host_id = (select auth.uid()) and status = 'draft');

grant select, insert, update, delete on public.listing_locations to authenticated;
create policy "own" on public.listing_locations for all to authenticated
  using ((select private.owns_listing(listing_id))) with check ((select private.owns_listing(listing_id)));

grant select on public.listing_photos to anon, authenticated;
grant insert (listing_id, path, shot, position, width, height, taken_at, taken_lat, taken_lng),
      update (shot, position), delete
  on public.listing_photos to authenticated;
create policy "read visible" on public.listing_photos for select using ((select private.listing_visible(listing_id)));
create policy "insert own" on public.listing_photos for insert to authenticated with check ((select private.owns_listing(listing_id)));
create policy "update own" on public.listing_photos for update to authenticated using ((select private.owns_listing(listing_id)));
create policy "delete own" on public.listing_photos for delete to authenticated using ((select private.owns_listing(listing_id)));

grant select on public.listing_costs, public.house_rules to anon, authenticated;
grant insert, update, delete on public.listing_costs, public.house_rules to authenticated;
create policy "read visible" on public.listing_costs for select using ((select private.listing_visible(listing_id)));
create policy "write own" on public.listing_costs for all to authenticated
  using ((select private.owns_listing(listing_id))) with check ((select private.owns_listing(listing_id)));
create policy "read visible" on public.house_rules for select using ((select private.listing_visible(listing_id)));
create policy "write own" on public.house_rules for all to authenticated
  using ((select private.owns_listing(listing_id))) with check ((select private.owns_listing(listing_id)));

grant select on public.commute_minutes to anon, authenticated;
create policy "read" on public.commute_minutes for select using (true);

grant select, insert, delete on public.saved_rooms to authenticated;
create policy "own" on public.saved_rooms for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Bookings: read by the two parties; changed only through booking functions.
-- ---------------------------------------------------------------------------
grant select on public.bookings, public.booking_events, public.agreement_versions to authenticated;
create policy "parties" on public.bookings for select to authenticated
  using ((select auth.uid()) in (tenant_id, host_id));
create policy "parties" on public.booking_events for select to authenticated using ((select private.is_party(booking_id)));
create policy "parties" on public.agreement_versions for select to authenticated using ((select private.is_party(booking_id)));

-- ---------------------------------------------------------------------------
-- Money: read-only from the app.
-- ---------------------------------------------------------------------------
grant select on public.host_payout_accounts, public.payments, public.payouts, public.refunds to authenticated;
create policy "own" on public.host_payout_accounts for select to authenticated using (host_id = (select auth.uid()));
create policy "parties" on public.payments for select to authenticated using ((select private.is_party(booking_id)));
create policy "host" on public.payouts for select to authenticated using (host_id = (select auth.uid()));
create policy "parties" on public.refunds for select to authenticated using ((select private.is_party(booking_id)));

-- ---------------------------------------------------------------------------
-- Stay
-- ---------------------------------------------------------------------------
grant select on public.check_ins to authenticated;
create policy "parties" on public.check_ins for select to authenticated using ((select private.is_party(booking_id)));

grant select, insert on public.condition_photos to authenticated;
create policy "parties read" on public.condition_photos for select to authenticated using ((select private.is_party(booking_id)));
create policy "parties add" on public.condition_photos for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and (select private.is_party(booking_id)));

grant select, insert on public.ratings to authenticated;
create policy "parties read" on public.ratings for select to authenticated using ((select private.is_party(booking_id)));
create policy "rate once" on public.ratings for insert to authenticated with check (
  rater_id = (select auth.uid())
  and exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.status in ('active', 'ending', 'moved_out', 'completed')
      and ((b.tenant_id = rater_id and b.host_id = ratee_id) or (b.host_id = rater_id and b.tenant_id = ratee_id))
  )
);

grant select, insert (reporter_id, booking_id, listing_id, kind, details) on public.reports to authenticated;
create policy "own" on public.reports for select to authenticated using (reporter_id = (select auth.uid()));
create policy "file" on public.reports for insert to authenticated with check (
  reporter_id = (select auth.uid()) and (booking_id is null or (select private.is_party(booking_id)))
);
