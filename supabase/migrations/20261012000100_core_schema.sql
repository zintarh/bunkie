-- Bunkie core schema: people, listings, bookings, money, stay.
-- Booking rules live in 20261012000300_booking_engine.sql; access rules in 20261012000200_security.sql.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.gender as enum ('female', 'male');
create type public.household as enum ('women', 'men', 'mixed');
create type public.share_pref as enum ('women_only', 'men_only', 'mixed_ok');
create type public.nysc_stage as enum ('in_camp', 'have_ppa', 'serving');
create type public.listing_status as enum ('draft', 'live', 'paused', 'flagged', 'archived');
create type public.room_kind as enum ('own_room', 'shared_room');
create type public.bath_kind as enum ('own', 'shared');
create type public.pay_schedule as enum ('monthly', 'lump_sum');
create type public.viewing_mode as enum ('in_person', 'video_call');
create type public.booking_status as enum (
  'requested', 'accepted', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed',
  'paid', 'moved_in', 'active', 'ending', 'moved_out', 'completed', 'closed'
);
create type public.payment_status as enum ('pending', 'success', 'failed', 'abandoned');
create type public.money_move_status as enum ('scheduled', 'processing', 'done', 'failed', 'cancelled');
create type public.photo_shot as enum ('bedroom', 'bathroom', 'kitchen', 'meter', 'entrance', 'extra');

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.nysc_batches (
  id text primary key,                 -- e.g. '2026-B2'
  year int not null,
  batch char(1) not null check (batch in ('A', 'B', 'C')),
  stream smallint not null check (stream in (1, 2)),
  camp_end date not null,
  unique (year, batch, stream)
);

create table public.ppa_zones (
  id smallint primary key,
  name text not null unique,
  lat double precision not null,
  lng double precision not null
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
-- Public face of a person: what other users may see.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 60),
  photo_path text,
  is_verified boolean not null default false,
  is_host boolean not null default false,
  standing smallint not null default 100 check (standing between 0 and 100),
  created_at timestamptz not null default now()
);

-- Owner-only details. Gender and phone_verified are written by the system only.
create table public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_name text check (char_length(last_name) <= 60),
  phone text check (phone ~ '^\+234[0-9]{10}$'),
  phone_verified boolean not null default false,
  whatsapp_opt_in boolean not null default true,
  gender public.gender,
  share_pref public.share_pref,
  nysc_stage public.nysc_stage,
  batch_id text references public.nysc_batches (id),
  state_code text check (state_code ~ '^[A-Z]{2}/[0-9]{2}[ABC]/[0-9]{3,5}$'),
  ppa_label text,
  ppa_lat double precision,
  ppa_lng double precision,
  ppa_zone_id smallint references public.ppa_zones (id),
  ppa_added_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One state code per account.
create unique index profile_private_state_code_key on public.profile_private (state_code) where state_code is not null;

-- The five bunkie questions. Answers are indexes into the option lists in the app.
create table public.bunkie_answers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  sleep smallint not null check (sleep between 0 and 3),
  guests smallint not null check (guests between 0 and 3),
  cooking smallint not null check (cooking between 0 and 3),
  cleaning smallint not null check (cleaning between 0 and 2),
  noise smallint not null check (noise between 0 and 2),
  summary text check (char_length(summary) <= 400),
  pledged_at timestamptz not null,
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Never exposed through the API. Holds outcomes only, not raw ID numbers.
create table private.verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('phone', 'nin', 'liveness', 'call_up', 'proof_of_address')),
  status text not null default 'pending' check (status in ('pending', 'passed', 'failed')),
  provider text,
  provider_ref text,
  masked_name text,
  doc_path text,
  result jsonb not null default '{}',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index on private.verifications (user_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  status public.listing_status not null default 'draft',
  area_name text not null default '' check (char_length(area_name) <= 80),
  -- Rounded to about 300 m so the public map never shows the house.
  area_lat double precision,
  area_lng double precision,
  room_kind public.room_kind,
  bath_kind public.bath_kind,
  furnished boolean,
  household public.household,
  open_to_camp boolean not null default false,
  min_months smallint not null default 1 check (min_months between 1 and 12),
  max_months smallint not null default 12 check (max_months between 1 and 12),
  pay_schedule public.pay_schedule not null default 'monthly',
  available_from date,
  rent_monthly int check (rent_monthly between 0 and 5000000),
  deposit int check (deposit between 0 and 5000000),
  monthly_total int not null default 0,
  total_varies boolean not null default false,
  early_leave_notice_days smallint not null default 14 check (early_leave_notice_days in (7, 14, 30)),
  redeploy_refund text not null default 'all_unused' check (redeploy_refund in ('all_unused', 'unused_minus_2w')),
  ask_leave_notice_days smallint not null default 7 check (ask_leave_notice_days in (7, 14, 30)),
  allowed_to_share boolean not null default false,
  photo_count smallint not null default 0,
  cover_path text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_months <= max_months)
);
create index listings_live_idx on public.listings (status, monthly_total) where status = 'live';
create index on public.listings (host_id);

-- Exact location: host only, shared with a tenant by function once a viewing is booked.
create table public.listing_locations (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  address_line text not null check (char_length(address_line) <= 200),
  lat double precision not null check (lat between 8.3 and 9.5),     -- FCT bounds
  lng double precision not null check (lng between 6.7 and 7.7),
  landmark text check (char_length(landmark) <= 120)
);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  path text not null unique,
  shot public.photo_shot not null,
  position smallint not null default 0,
  width int,
  height int,
  taken_at timestamptz not null,
  taken_lat double precision,
  taken_lng double precision,
  distance_m int,                       -- from the listing pin, set by trigger
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.listing_photos (listing_id, position);

create table public.listing_costs (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  amount int not null default 0 check (amount between 0 and 1000000),
  tenant_pays boolean not null default true,
  varies boolean not null default false,
  position smallint not null default 0
);
create index on public.listing_costs (listing_id);

create table public.house_rules (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 60),
  choice text not null check (char_length(choice) between 1 and 160),
  consequence text not null default 'warning_then_notice'
    check (consequence in ('warning', 'warning_then_notice', 'notice')),
  is_custom boolean not null default false,
  position smallint not null default 0
);
create index on public.house_rules (listing_id);

create table public.commute_minutes (
  listing_id uuid not null references public.listings (id) on delete cascade,
  zone_id smallint not null references public.ppa_zones (id),
  minutes smallint not null,
  computed_at timestamptz not null default now(),
  primary key (listing_id, zone_id)
);
create index on public.commute_minutes (zone_id, minutes);

create table public.saved_rooms (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id),
  tenant_id uuid not null references public.profiles (id),
  host_id uuid not null references public.profiles (id),
  status public.booking_status not null default 'requested',
  is_camp_booking boolean not null default false,
  move_in date not null,
  months smallint not null check (months between 1 and 12),
  move_out date not null,
  stay daterange generated always as (daterange(move_in, move_out)) stored,
  monthly_total int not null,
  message text check (char_length(message) <= 500),
  deadline_at timestamptz,
  offered_slots timestamptz[] not null default '{}',
  viewing_mode public.viewing_mode,
  viewing_at timestamptz,
  reschedules smallint not null default 0,
  tenant_matched_at timestamptz,
  arrival_window text check (arrival_window in ('morning', 'midday', 'afternoon', 'evening')),
  close_reason text,
  closed_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (move_out > move_in),
  check (tenant_id <> host_id)
);
create index on public.bookings (tenant_id, status);
create index on public.bookings (host_id, status);
create index on public.bookings (listing_id, status);
create index bookings_deadline_idx on public.bookings (deadline_at)
  where status in ('requested', 'accepted', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed', 'moved_in', 'moved_out');

-- No two paid stays can overlap on the same room.
alter table public.bookings add constraint no_double_booking
  exclude using gist (listing_id with =, stay with &&)
  where (status in ('paid', 'moved_in', 'active', 'ending'));

-- One request in progress per room at a time; the rest wait in line.
create unique index one_live_request_per_room on public.bookings (listing_id)
  where status in ('accepted', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed');

-- A tenant can't have two open requests for the same room.
create unique index one_open_request_per_tenant_room on public.bookings (listing_id, tenant_id)
  where status in ('requested', 'accepted', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed');

create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  actor_id uuid,
  action text not null,
  from_status public.booking_status,
  to_status public.booking_status,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.booking_events (booking_id, id);

create table public.agreement_versions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  version int not null,
  terms jsonb not null,
  terms_hash text not null,
  host_confirmed_at timestamptz,
  tenant_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, version)
);

-- ---------------------------------------------------------------------------
-- Money (amounts in kobo, as Paystack uses)
-- ---------------------------------------------------------------------------
create table public.host_payout_accounts (
  host_id uuid primary key references public.profiles (id) on delete cascade,
  bank_code text not null,
  bank_name text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  account_name text not null,
  subaccount_code text,
  name_matches_nin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  payer_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('booking', 'rent')),
  amount_kobo bigint not null check (amount_kobo > 0),      -- rent + deposit, what the host side is owed
  paystack_fee_kobo bigint not null default 0,              -- passed to the payer
  bunkie_fee_kobo bigint not null default 0,
  paystack_reference text not null unique,
  status public.payment_status not null default 'pending',
  paid_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index on public.payments (booking_id);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id),
  booking_id uuid not null references public.bookings (id),
  host_id uuid not null references public.profiles (id),
  amount_kobo bigint not null,
  status public.money_move_status not null default 'scheduled',
  release_after timestamptz not null,
  provider_ref text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id),
  booking_id uuid not null references public.bookings (id),
  amount_kobo bigint not null,
  reason text not null,
  status public.money_move_status not null default 'scheduled',
  provider_ref text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.refunds (booking_id);

-- ---------------------------------------------------------------------------
-- Stay
-- ---------------------------------------------------------------------------
create table public.check_ins (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  as_listed boolean not null,
  problem text,
  tenant_checked_in_at timestamptz,
  host_confirmed_at timestamptz
);

create table public.condition_photos (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  phase text not null check (phase in ('move_in', 'move_out')),
  path text not null unique,
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  rater_id uuid not null references public.profiles (id),
  ratee_id uuid not null references public.profiles (id),
  accurate jsonb not null,          -- {"sleep": true, "guests": false, ...}
  created_at timestamptz not null default now(),
  unique (booking_id, rater_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  booking_id uuid references public.bookings (id),
  listing_id uuid references public.listings (id),
  kind text not null check (kind in ('danger', 'not_as_listed', 'cant_get_in', 'no_show', 'payment', 'behaviour', 'other')),
  details text check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'in_review', 'closed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Jobs: outbox for WhatsApp, email, payouts, refunds, commute.
-- Written in the same transaction as the change that causes it; drained by the worker function.
-- ---------------------------------------------------------------------------
create table private.jobs (
  id bigint generated always as identity primary key,
  queue text not null check (queue in ('whatsapp', 'email', 'payout', 'refund', 'commute', 'verification')),
  payload jsonb not null,
  run_after timestamptz not null default now(),
  attempts smallint not null default 0,
  locked_until timestamptz,
  done_at timestamptz,
  dead boolean not null default false,
  last_error text,
  created_at timestamptz not null default now()
);
create index jobs_ready_idx on private.jobs (queue, run_after) where done_at is null and not dead;

-- ---------------------------------------------------------------------------
-- Small helpers and triggers
-- ---------------------------------------------------------------------------
create or replace function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns int language sql immutable parallel safe as $$
  select round(2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))::int
$$;

create or replace function private.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger touch before update on public.listings for each row execute function private.touch_updated_at();
create trigger touch before update on public.bookings for each row execute function private.touch_updated_at();
create trigger touch before update on public.profile_private for each row execute function private.touch_updated_at();
create trigger touch before update on public.bunkie_answers for each row execute function private.touch_updated_at();
create trigger touch before update on public.payouts for each row execute function private.touch_updated_at();
create trigger touch before update on public.refunds for each row execute function private.touch_updated_at();

-- New account -> profile rows.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, first_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'first_name', 60), ''));
  insert into public.profile_private (user_id, last_name)
  values (new.id, left(new.raw_user_meta_data ->> 'last_name', 60));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep the listing's monthly total in step with its costs.
create or replace function private.refresh_listing_total(p_listing uuid) returns void
language sql security definer set search_path = '' as $$
  update public.listings l set
    monthly_total = coalesce(l.rent_monthly, 0) + coalesce((
      select sum(c.amount) from public.listing_costs c where c.listing_id = l.id and c.tenant_pays), 0),
    total_varies = exists (
      select 1 from public.listing_costs c where c.listing_id = l.id and c.tenant_pays and c.varies)
  where l.id = p_listing
$$;

create or replace function private.costs_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.refresh_listing_total(coalesce(new.listing_id, old.listing_id));
  return null;
end $$;

create trigger costs_changed after insert or update or delete on public.listing_costs
  for each row execute function private.costs_changed();

create or replace function private.rent_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.rent_monthly is distinct from old.rent_monthly then
    perform private.refresh_listing_total(new.id);
  end if;
  return null;
end $$;

create trigger rent_changed after update of rent_monthly on public.listings
  for each row execute function private.rent_changed();

-- Photos: distance from the pin, photo count and cover.
create or replace function private.photo_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_listing uuid := coalesce(new.listing_id, old.listing_id);
  v_limit int;
begin
  if tg_op = 'INSERT' and new.taken_lat is not null then
    select (value #>> '{}')::int into v_limit from public.settings where key = 'photo_max_distance_m';
    update public.listing_photos p set
      distance_m = public.distance_m(p.taken_lat, p.taken_lng, loc.lat, loc.lng),
      flagged = public.distance_m(p.taken_lat, p.taken_lng, loc.lat, loc.lng) > coalesce(v_limit, 150)
    from public.listing_locations loc
    where p.id = new.id and loc.listing_id = p.listing_id;
  end if;
  update public.listings l set
    photo_count = (select count(*) from public.listing_photos p where p.listing_id = l.id),
    cover_path = (select p.path from public.listing_photos p where p.listing_id = l.id
                  order by (p.shot = 'bedroom') desc, p.position limit 1)
  where l.id = v_listing;
  return null;
end $$;

create trigger photo_changed after insert or delete on public.listing_photos
  for each row execute function private.photo_changed();
