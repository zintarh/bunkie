-- Serving corper hosts prove it with state code + call-up letter + PPA acceptance letter + batch.
-- The batch tells us when service ends, so "serving" becomes "served" on its own.

-- Batches still serving in 2026. [TBD] camp end dates are placeholders, like the 2026 ones in seed.sql.
insert into public.nysc_batches (id, year, batch, stream, camp_end) values
  ('2025-A1', 2025, 'A', 1, '2025-05-26'),
  ('2025-A2', 2025, 'A', 2, '2025-06-30'),
  ('2025-B1', 2025, 'B', 1, '2025-10-20'),
  ('2025-B2', 2025, 'B', 2, '2025-10-31'),
  ('2025-C1', 2025, 'C', 1, '2026-02-16'),
  ('2025-C2', 2025, 'C', 2, '2026-03-23')
on conflict (id) do nothing;

alter table private.verifications drop constraint verifications_kind_check;
alter table private.verifications add constraint verifications_kind_check
  check (kind in ('phone', 'nin', 'liveness', 'call_up', 'proof_of_address', 'discharge', 'ppa_letter'));

-- The service year runs about 11 months past camp.
create or replace function private.service_ends(p_user uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (b.camp_end + interval '11 months')::date
  from public.profile_private pp join public.nysc_batches b on b.id = pp.batch_id
  where pp.user_id = p_user
$$;

-- serving: call-up + PPA letter passed and service not over yet.
-- served:  NYSC certificate passed, or a serving proof whose service year has ended.
create or replace function private.corper_check(p_user uuid, p_status public.corper_status) returns boolean
language sql stable security definer set search_path = '' as $$
  with proof as (
    select
      exists (select 1 from private.verifications v where v.user_id = p_user and v.kind = 'call_up' and v.status = 'passed')
        and exists (select 1 from private.verifications v where v.user_id = p_user and v.kind = 'ppa_letter' and v.status = 'passed')
        as serving_docs,
      exists (select 1 from private.verifications v where v.user_id = p_user and v.kind = 'discharge' and v.status = 'passed')
        as certificate,
      private.service_ends(p_user) as ends
  )
  select case p_status
    when 'serving' then serving_docs and ends >= current_date
    when 'served' then certificate or (serving_docs and ends < current_date)
    else false
  end
  from proof
$$;

-- Daily: serving hosts whose service year ended become "served" (the trigger re-checks the badge).
create or replace function public.sys_end_service() returns int
language sql security definer set search_path = '' as $$
  with ended as (
    update public.profiles p set corper_status = 'served'
    where p.corper_status = 'serving' and private.service_ends(p.id) < current_date
    returning 1
  )
  select count(*)::int from ended
$$;
revoke execute on function public.sys_end_service() from public, anon, authenticated;
grant execute on function public.sys_end_service() to service_role;
