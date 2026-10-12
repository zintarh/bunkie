-- Reference data. Safe to run more than once.

insert into public.settings (key, value) values
  ('host_reply_hours', '12'),
  ('pick_viewing_hours', '24'),
  ('viewed_hours', '48'),
  ('confirm_hours', '24'),
  ('pay_hours', '24'),
  ('move_in_confirm_hours', '24'),
  ('payout_delay_hours', '24'),
  ('move_out_settle_days', '7'),
  ('ppa_switch_hours', '48'),
  ('max_open_requests', '3'),
  ('min_notice_days', '7'),
  ('photo_max_distance_m', '150'),
  ('require_verification_to_request', 'true'),
  ('require_host_verification', 'true'),
  ('require_payout_account', 'true'),
  -- Bad-day switches, read by the app.
  ('flag_map_view', 'true'),
  ('flag_new_listings', 'true'),
  ('flag_waiting_room', 'false'),
  ('search_cache_seconds', '60')
on conflict (key) do nothing;

-- Camp exit dates per batch and stream. [TBD] confirm each batch from the NYSC calendar.
insert into public.nysc_batches (id, year, batch, stream, camp_end) values
  ('2026-A1', 2026, 'A', 1, '2026-05-26'),
  ('2026-A2', 2026, 'A', 2, '2026-06-30'),
  ('2026-B1', 2026, 'B', 1, '2026-10-20'),
  ('2026-B2', 2026, 'B', 2, '2026-10-31'),
  ('2026-C1', 2026, 'C', 1, '2027-02-16'),
  ('2026-C2', 2026, 'C', 2, '2027-03-23')
on conflict (id) do update set camp_end = excluded.camp_end;

-- PPA zones for commute times. Centre points are approximate. [TBD] final zone list.
insert into public.ppa_zones (id, name, lat, lng) values
  (1, 'Central Area', 9.0579, 7.4951),
  (2, 'Garki', 9.0300, 7.4880),
  (3, 'Wuse', 9.0700, 7.4800),
  (4, 'Wuse 2', 9.0790, 7.4700),
  (5, 'Maitama', 9.0880, 7.4930),
  (6, 'Asokoro', 9.0430, 7.5270),
  (7, 'Utako', 9.0700, 7.4400),
  (8, 'Jabi', 9.0700, 7.4200),
  (9, 'Wuye', 9.0600, 7.4550),
  (10, 'Mabushi', 9.0800, 7.4550),
  (11, 'Jahi', 9.0900, 7.4500),
  (12, 'Kado', 9.0900, 7.4300),
  (13, 'Life Camp', 9.0800, 7.4000),
  (14, 'Gwarinpa', 9.1100, 7.4000),
  (15, 'Katampe', 9.1100, 7.4500),
  (16, 'Dawaki', 9.1300, 7.4100),
  (17, 'Kubwa', 9.1500, 7.3300),
  (18, 'Dutse', 9.1500, 7.4500),
  (19, 'Mpape', 9.1200, 7.4900),
  (20, 'Bwari', 9.2800, 7.3800),
  (21, 'Durumi', 9.0200, 7.4600),
  (22, 'Gudu', 9.0100, 7.4700),
  (23, 'Apo', 9.0000, 7.5000),
  (24, 'Lokogoma', 8.9900, 7.4600),
  (25, 'Galadimawa', 9.0000, 7.4300),
  (26, 'Lugbe', 8.9800, 7.3800),
  (27, 'Idu', 9.0300, 7.3500),
  (28, 'Nyanya', 9.0200, 7.5700),
  (29, 'Karu', 9.0100, 7.5500),
  (30, 'Kuje', 8.8800, 7.2300),
  (31, 'Gwagwalada', 8.9400, 7.0800)
on conflict (id) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng;
