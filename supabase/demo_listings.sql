-- Five demo apartments for testing search, filters and booking. NOT for production.
-- Re-runnable: removes the earlier demo hosts (and their listings) first.
-- Run: supabase db query --linked -f supabase/demo_listings.sql   (or paste into the SQL editor)
-- Demo hosts can't sign in (no password). Photos are the bundled /demo images.

begin;

delete from auth.users where email like '%@demo.bunkie.test';
drop table if exists demo;

-- Hosts -----------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, '', now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', first_name), now(), now()
from (values
  ('d0000000-0000-4000-8000-000000000001', 'amaka@demo.bunkie.test', 'Amaka'),
  ('d0000000-0000-4000-8000-000000000002', 'musa@demo.bunkie.test', 'Musa'),
  ('d0000000-0000-4000-8000-000000000003', 'ngozi@demo.bunkie.test', 'Ngozi'),
  ('d0000000-0000-4000-8000-000000000004', 'blessing@demo.bunkie.test', 'Blessing'),
  ('d0000000-0000-4000-8000-000000000005', 'tunde@demo.bunkie.test', 'Tunde')
) h(id, email, first_name);

update public.profiles set is_verified = true, is_host = true
where id in ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
             'd0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004');
update public.profiles set is_host = true where id = 'd0000000-0000-4000-8000-000000000005';

-- Corp member status: Amaka and Blessing serving (call-up + PPA letter), Musa served (certificate).
update public.profile_private set batch_id = '2026-A1', state_code = 'FC/26A/' || right(user_id::text, 4)
where user_id in ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004');
insert into private.verifications (user_id, kind, status, provider, provider_ref, decided_at)
select u::uuid, k, 'passed', 'demo', 'demo', now()
from (values ('d0000000-0000-4000-8000-000000000001', 'call_up'), ('d0000000-0000-4000-8000-000000000001', 'ppa_letter'),
             ('d0000000-0000-4000-8000-000000000004', 'call_up'), ('d0000000-0000-4000-8000-000000000004', 'ppa_letter'),
             ('d0000000-0000-4000-8000-000000000002', 'discharge')) v(u, k);
update public.profiles set corper_status = 'serving' where id in ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004');
update public.profiles set corper_status = 'served' where id = 'd0000000-0000-4000-8000-000000000002';
update public.profiles set corper_status = 'not_corper' where id in ('d0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000005');

-- Lifestyle answers (for bunkie fit).
insert into public.bunkie_answers (user_id, sleep, guests, cooking, cleaning, noise, pledged_at, approved_at)
values ('d0000000-0000-4000-8000-000000000001', 1, 1, 2, 0, 0, now(), now()),
       ('d0000000-0000-4000-8000-000000000002', 0, 2, 1, 1, 1, now(), now()),
       ('d0000000-0000-4000-8000-000000000003', 2, 0, 0, 0, 0, now(), now()),
       ('d0000000-0000-4000-8000-000000000004', 1, 1, 3, 1, 1, now(), now()),
       ('d0000000-0000-4000-8000-000000000005', 3, 2, 1, 2, 2, now(), now());

-- Listings --------------------------------------------------------------------
create temp table demo (
  n int, id uuid, host uuid, area text, lat double precision, lng double precision, address text, landmark text,
  room public.room_kind, bath public.bath_kind, furnished boolean, household public.household, camp boolean,
  min_m int, max_m int, pay public.pay_schedule, free_in int, rent int, deposit int, short boolean, weekly int
);
insert into demo values
  -- 1. Wuse 2: own room + own bath, women, camp + short stays, serving corper host
  (1, 'd1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Wuse 2', 9.0795, 7.4712,
   'Flat 3, 14 Aminu Kano Crescent', 'Behind Banex Plaza', 'own_room', 'own', true, 'women', true, 1, 6, 'monthly', 0, 75000, 30000, true, 25000),
  -- 2. Gwarinpa: shared room, men, budget, long stays, ex-corper host
  (2, 'd1000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'Gwarinpa', 9.1112, 7.4031,
   'House 22, 3rd Avenue', 'Near Gwarinpa Estate gate', 'shared_room', 'shared', true, 'men', false, 3, 12, 'monthly', 3, 38000, 20000, false, null),
  -- 3. Garki: own room, mixed, lump sum, 6-12 months, not a corper
  (3, 'd1000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'Garki', 9.0312, 7.4869,
   'Flat 8, Block B, Ahmadu Bello Way', 'Opposite Area 1 shopping centre', 'own_room', 'shared', true, 'mixed', false, 6, 12, 'lump_sum', 7, 110000, 50000, false, null),
  -- 4. Kubwa: shared room, women, cheapest, camp + short stays, serving corper host
  (4, 'd1000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000004', 'Kubwa', 9.1523, 7.3318,
   'House 5, Phase 2 Site 1', 'Off Kubwa Expressway', 'shared_room', 'shared', false, 'women', true, 1, 3, 'monthly', 0, 28000, null, true, 12000),
  -- 5. Jabi: own room + own bath, mixed, premium, short stays, host not verified
  (5, 'd1000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000005', 'Jabi', 9.0688, 7.4215,
   'Flat 12, Jabi Lake Court', 'Near Jabi Lake Mall', 'own_room', 'own', true, 'mixed', true, 1, 12, 'monthly', 1, 140000, 70000, true, 40000);

insert into public.listings (id, host_id, status, area_name, room_kind, bath_kind, furnished, household, open_to_camp,
  min_months, max_months, pay_schedule, available_from, rent_monthly, deposit, allowed_to_share, open_to_short, weekly_price,
  published_at, area_lat, area_lng)
select id, host, 'live', area, room, bath, furnished, household, camp, min_m, max_m, pay, current_date + free_in, rent, deposit,
       true, short, weekly, now() - (n || ' hours')::interval,
       round((lat / 0.003)::numeric) * 0.003, round((lng / 0.003)::numeric) * 0.003
from demo;

insert into public.listing_locations (listing_id, address_line, landmark, lat, lng)
select id, address, landmark, lat, lng from demo;

insert into public.listing_costs (listing_id, name, amount, tenant_pays, varies, position)
select d.id, c.name, c.amount, c.tenant_pays, c.varies, c.pos
from demo d, (values
  (1, 'Light', 8000, true, true, 0), (1, 'Water', 0, false, false, 1), (1, 'Wi-Fi', 5000, true, false, 2),
  (2, 'Light', 5000, true, true, 0), (2, 'Generator fuel', 3000, true, true, 1),
  (3, 'Light', 10000, true, true, 0), (3, 'Service charge', 15000, true, false, 1), (3, 'Water', 0, false, false, 2),
  (4, 'Light', 4000, true, true, 0), (4, 'Waste', 1000, true, false, 1),
  (5, 'Light', 15000, true, true, 0), (5, 'Wi-Fi', 0, false, false, 1), (5, 'Service charge', 20000, true, false, 2)
) c(n, name, amount, tenant_pays, varies, pos)
where c.n = d.n;

insert into public.listing_photos (listing_id, path, shot, position, taken_at, taken_lat, taken_lng)
select d.id, '/demo/room-' || (((d.n + s.i) % 4) + 1) || '.svg?l=' || d.n || '-' || s.shot,
       s.shot::public.photo_shot, s.i, now(), d.lat, d.lng
from demo d, (values ('bedroom', 0), ('bathroom', 1), ('kitchen', 2), ('meter', 3), ('entrance', 4), ('extra', 5)) s(shot, i);

insert into public.house_rules (listing_id, topic, choice, consequence, is_custom, position)
select d.id, r.topic, r.choice, r.consequence, false, r.pos
from demo d, (values
  (1, 'Guests', 'Day visitors only', 'warning_then_notice', 0), (1, 'Noise', 'Quiet after 10pm', 'warning', 1),
  (2, 'Smoking', 'Outside only', 'warning_then_notice', 0), (2, 'Cooking', 'Shared kitchen', 'warning', 1),
  (3, 'Guests', 'No guests', 'notice', 0), (3, 'Pets', 'No pets', 'warning_then_notice', 1), (3, 'Noise', 'Quiet after 10pm', 'warning', 2),
  (4, 'Guests', 'Day visitors only', 'warning', 0), (4, 'Cooking', 'Own cooker only', 'warning', 1),
  (5, 'Guests', 'Anytime', 'warning', 0), (5, 'Noise', 'Quiet after midnight', 'warning', 1)
) r(n, topic, choice, consequence, pos)
where r.n = d.n;

select private.refresh_listing_total(id) from demo;
drop table demo;

commit;

select l.area_name, l.status, l.monthly_total, l.weekly_price, l.photo_count, p.first_name, p.corper_status, p.corper_verified
from public.listings l join public.profiles p on p.id = l.host_id
where l.host_id::text like 'd0000000-%' order by l.area_name;
