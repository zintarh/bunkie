-- Listing steps can be done in any order (the app shows which are filled in), so the separate
-- progress counter isn't needed. Publishing now also needs at least one house rule.

alter table public.listings drop column draft_step;

create or replace function public.listing_missing(p_listing uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when loc.listing_id is null then 'location' end,
    case when (select count(distinct p.shot) from public.listing_photos p
               where p.listing_id = l.id and p.shot in ('bedroom', 'bathroom', 'kitchen', 'meter', 'entrance')) < 5
         then 'photos' end,
    case when coalesce(l.rent_monthly, 0) <= 0 then 'rent' end,
    case when l.room_kind is null then 'room_kind' end,
    case when l.household is null then 'household' end,
    case when l.available_from is null then 'available_from' end,
    case when not l.allowed_to_share then 'permission' end,
    case when not exists (select 1 from public.house_rules r where r.listing_id = l.id) then 'rules' end,
    case when not exists (select 1 from public.bunkie_answers a where a.user_id = l.host_id) then 'bunkie_questions' end,
    case when private.setting_bool('require_host_verification', true)
              and not (select pr.is_verified from public.profiles pr where pr.id = l.host_id) then 'verification' end,
    case when private.setting_bool('require_payout_account', true)
              and not exists (select 1 from public.host_payout_accounts h where h.host_id = l.host_id) then 'payout' end
  ], null)
  from public.listings l
  left join public.listing_locations loc on loc.listing_id = l.id
  where l.id = p_listing and l.host_id = auth.uid()
$$;
