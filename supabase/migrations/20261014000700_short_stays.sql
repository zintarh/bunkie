-- Short stays: 1-4 weeks at a weekly price the host sets, paid upfront with no deposit.
-- A host can accept one without a viewing; the address then shows once it's paid (like camp bookings).

alter table public.listings
  add column open_to_short boolean not null default false,
  add column weekly_price int check (weekly_price between 0 and 2000000);
grant insert (open_to_short, weekly_price), update (open_to_short, weekly_price) on public.listings to authenticated;

-- A booking is in weeks or in months, never both.
alter table public.bookings
  alter column months drop not null,
  add column weeks smallint check (weeks between 1 and 4),
  add column weekly_price int,
  add constraint stay_length check ((months is null) <> (weeks is null));

create or replace function private.terms_for(p_booking public.bookings) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'listing_id', l.id,
    'move_in', p_booking.move_in,
    'move_out', p_booking.move_out,
    'months', p_booking.months,
    'weeks', p_booking.weeks,
    'weekly_price', p_booking.weekly_price,
    'monthly_total', p_booking.monthly_total,
    'rent_monthly', l.rent_monthly,
    'deposit', case when p_booking.weeks is not null then 0 else coalesce(l.deposit, 0) end,
    'pay_schedule', case when p_booking.weeks is not null then 'lump_sum' else l.pay_schedule::text end,
    'total_varies', l.total_varies,
    'costs', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'amount', c.amount,
                        'tenant_pays', c.tenant_pays, 'varies', c.varies) order by c.position)
                      from public.listing_costs c where c.listing_id = l.id), '[]'),
    'rules', coalesce((select jsonb_agg(jsonb_build_object('topic', r.topic, 'choice', r.choice,
                        'consequence', r.consequence) order by r.position)
                      from public.house_rules r where r.listing_id = l.id), '[]'),
    'refunds', jsonb_build_object(
      'early_leave_notice_days', l.early_leave_notice_days,
      'redeploy_refund', l.redeploy_refund,
      'ask_leave_notice_days', l.ask_leave_notice_days,
      'short_stay_no_refund_last_days', 3),
    'platform', jsonb_build_object(
      'payment_held_until_move_in', true,
      'min_notice_days', private.setting_int('min_notice_days', 7),
      'belongings_never_held', true,
      'host_cancel_full_refund', true)
  )
  from public.listings l where l.id = p_booking.listing_id
$$;

drop function public.request_room(uuid, date, int, text);
create or replace function public.request_room(
  p_listing uuid, p_move_in date, p_months int default null, p_message text default null, p_weeks int default null)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_me public.profile_private;
  v_prof public.profiles;
  v_l public.listings;
  v_camp_end date;
  v_open int;
  v_in_lane boolean;
  v_row public.bookings;
  v_move_out date;
begin
  if v_uid is null then perform private.fail('auth', 'Log in to request a room.'); end if;

  -- Lock the tenant so two taps can't both pass the open-request limit.
  select * into v_me from public.profile_private where user_id = v_uid for update;
  select * into v_prof from public.profiles where id = v_uid;
  select * into v_l from public.listings where id = p_listing;

  if v_l.id is null or v_l.status <> 'live' then perform private.fail('not_available', 'This room is no longer available.'); end if;
  if v_l.host_id = v_uid then perform private.fail('own_room', 'You can''t request your own room.'); end if;
  if private.setting_bool('require_verification_to_request', true) and not v_prof.is_verified then
    perform private.fail('verify', 'Verify your ID before sending a request.');
  end if;
  -- A stay is either 1-4 weeks (short stay, if the host offers it) or months within the host's range.
  if (p_months is null) = (p_weeks is null) then perform private.fail('length', 'Pick how long you''re staying.'); end if;
  if p_weeks is not null then
    if not v_l.open_to_short or coalesce(v_l.weekly_price, 0) <= 0 then
      perform private.fail('weeks', 'This host doesn''t take short stays.');
    end if;
    if p_weeks not between 1 and 4 then perform private.fail('weeks', 'Short stays are 1 to 4 weeks.'); end if;
  elsif p_months < v_l.min_months or p_months > v_l.max_months then
    perform private.fail('months', format('This room is for %s to %s months.', v_l.min_months, v_l.max_months));
  end if;
  v_move_out := case when p_weeks is not null then p_move_in + 7 * p_weeks
                     else (p_move_in + make_interval(months => p_months))::date end;
  if p_move_in < current_date then perform private.fail('date', 'Pick a move-in date from today on.'); end if;
  if v_l.available_from is not null and p_move_in < v_l.available_from then
    perform private.fail('date', 'The room isn''t free on that date.');
  end if;

  -- Both sides must fit: the tenant's own gender against the household, and the tenant's pick.
  if v_me.gender is not null and (
       (v_l.household = 'women' and v_me.gender <> 'female') or
       (v_l.household = 'men' and v_me.gender <> 'male')) then
    perform private.fail('household', 'This home is for a different household.');
  end if;
  if (v_me.share_pref = 'women_only' and v_l.household <> 'women') or
     (v_me.share_pref = 'men_only' and v_l.household <> 'men') then
    perform private.fail('household', 'This home doesn''t match who you want to live with.');
  end if;

  -- In camp: only hosts open to camp bookings, move-in on the camp exit date, landing pad length.
  if v_me.nysc_stage = 'in_camp' then
    select camp_end into v_camp_end from public.nysc_batches where id = v_me.batch_id;
    if not v_l.open_to_camp then perform private.fail('camp', 'This host isn''t taking camp bookings.'); end if;
    if v_camp_end is not null and p_move_in <> v_camp_end then
      perform private.fail('camp', 'Camp bookings move in on your camp exit day.');
    end if;
    if p_months > 3 then perform private.fail('camp', 'Camp bookings are up to 3 months.'); end if;
  end if;

  if exists (select 1 from public.bookings
             where listing_id = p_listing and status in ('paid', 'moved_in', 'active', 'ending')
               and stay && daterange(p_move_in, v_move_out)) then
    perform private.fail('taken', 'The room is booked for those dates.');
  end if;

  select count(*) into v_open from public.bookings
  where tenant_id = v_uid and status in ('requested', 'accepted', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed');
  if v_open >= private.setting_int('max_open_requests', 3) then
    perform private.fail('limit', format('You can have %s open requests. Withdraw one to send another.',
                                         private.setting_int('max_open_requests', 3)));
  end if;

  v_in_lane := exists (select 1 from public.bookings where listing_id = p_listing
                       and status in ('accepted', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed'));

  insert into public.bookings (listing_id, tenant_id, host_id, is_camp_booking, move_in, months, weeks, weekly_price,
                               move_out, monthly_total, message, deadline_at)
  values (p_listing, v_uid, v_l.host_id, coalesce(v_me.nysc_stage = 'in_camp', false), p_move_in, p_months, p_weeks,
          case when p_weeks is not null then v_l.weekly_price end, v_move_out, v_l.monthly_total,
          nullif(left(trim(p_message), 500), ''),
          case when v_in_lane then null
               else now() + make_interval(hours => private.setting_int('host_reply_hours', 12)) end)
  returning * into v_row;

  insert into public.booking_events (booking_id, actor_id, action, to_status, payload)
  values (v_row.id, v_uid, 'request', 'requested', jsonb_build_object('move_in', p_move_in, 'months', p_months, 'weeks', p_weeks));
  perform private.notify(v_l.host_id, 'request_new', v_row.id);
  return v_row;
exception
  when unique_violation then
    perform private.fail('duplicate', 'You already have a request for this room.');
end $$;
revoke execute on function public.request_room(uuid, date, int, text, int) from public, anon;
grant execute on function public.request_room(uuid, date, int, text, int) to authenticated;

create or replace function public.booking_action(
  p_booking uuid, p_action text, p_version int default null, p_payload jsonb default '{}'
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  b public.bookings;
  v_tenant boolean;
  v_host boolean;
  v_slot timestamptz;
  v_slots timestamptz[];
  v_mode public.viewing_mode;
  v_terms jsonb;
  v_ver public.agreement_versions;
  v_who uuid;
  v_end date;
  v_notice int;
begin
  if v_uid is null then perform private.fail('auth', 'Log in first.'); end if;

  select * into b from public.bookings where id = p_booking for update;
  if b.id is null then perform private.fail('not_found', 'Booking not found.'); end if;
  v_tenant := v_uid = b.tenant_id;
  v_host := v_uid = b.host_id;
  if not (v_tenant or v_host) then perform private.fail('not_found', 'Booking not found.'); end if;
  if p_version is not null and p_version <> b.version then
    perform private.fail('stale', 'This booking just changed. Refresh to see the latest.');
  end if;

  -- Tenant withdraws any time before paying.
  if p_action = 'withdraw' and v_tenant
     and b.status in ('requested', 'accepted', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed') then
    return private.close(b, 'withdrawn', v_uid);

  -- Host declines before terms are agreed.
  elsif p_action = 'decline' and v_host and b.status in ('requested', 'accepted', 'viewing_booked', 'viewed') then
    return private.close(b, 'host_declined', v_uid);

  -- Short stays: the host can accept without a viewing, which makes the agreement ready straight away.
  elsif p_action = 'accept' and v_host and b.status = 'requested' and b.weeks is not null
        and coalesce((p_payload ->> 'skip_viewing')::boolean, false) then
    v_terms := private.terms_for(b);
    begin
      insert into public.agreement_versions (booking_id, version, terms, terms_hash, host_confirmed_at)
      values (b.id, coalesce((select max(version) from public.agreement_versions where booking_id = b.id), 0) + 1,
              v_terms, encode(extensions.digest(v_terms::text, 'sha256'), 'hex'), now());
      b := private.move(b, 'host_confirmed', 'accept_short_stay', v_uid,
                        now() + make_interval(hours => private.setting_int('confirm_hours', 24)));
    exception when unique_violation then
      perform private.fail('room_busy', 'You''re already going ahead with another request for this room. Finish or close it first.');
    end;
    update public.bookings set deadline_at = null
    where listing_id = b.listing_id and status = 'requested' and id <> b.id;
    perform private.notify(b.tenant_id, 'agreement_ready', b.id);
    return b;

  -- Host accepts and offers viewing times.
  elsif p_action = 'accept' and v_host and b.status = 'requested' then
    select array_agg(x::timestamptz order by x::timestamptz) into v_slots
    from jsonb_array_elements_text(coalesce(p_payload -> 'slots', '[]')) x;
    if coalesce(array_length(v_slots, 1), 0) = 0 then perform private.fail('slots', 'Offer at least one viewing time.'); end if;
    if exists (select 1 from unnest(v_slots) s where s < now()) then perform private.fail('slots', 'Viewing times must be in the future.'); end if;
    begin
      update public.bookings set offered_slots = v_slots where id = b.id;
      b := private.move(b, 'accepted', 'accept', v_uid,
                        now() + make_interval(hours => private.setting_int('pick_viewing_hours', 24)),
                        jsonb_build_object('slots', to_jsonb(v_slots)));
    exception when unique_violation then
      perform private.fail('room_busy', 'You''re already going ahead with another request for this room. Finish or close it first.');
    end;
    -- Others for this room wait without a clock until this one finishes.
    update public.bookings set deadline_at = null
    where listing_id = b.listing_id and status = 'requested' and id <> b.id;
    perform private.notify(b.tenant_id, 'request_accepted', b.id);
    return b;

  -- Tenant picks a viewing time.
  elsif p_action = 'book_viewing' and v_tenant and b.status = 'accepted' then
    v_slot := (p_payload ->> 'at')::timestamptz;
    v_mode := coalesce((p_payload ->> 'mode')::public.viewing_mode, 'in_person');
    if v_slot is null or not (v_slot = any (b.offered_slots)) then perform private.fail('slots', 'Pick one of the offered times.'); end if;
    if b.is_camp_booking and v_mode <> 'video_call' then perform private.fail('camp', 'Camp bookings are viewed by video call.'); end if;
    update public.bookings set viewing_at = v_slot, viewing_mode = v_mode where id = b.id;
    b := private.move(b, 'viewing_booked', 'book_viewing', v_uid,
                      v_slot + make_interval(hours => private.setting_int('viewed_hours', 48)),
                      jsonb_build_object('at', v_slot, 'mode', v_mode));
    perform private.notify(b.host_id, 'viewing_booked', b.id);
    perform private.notify(b.tenant_id, 'viewing_booked', b.id);
    perform private.enqueue('whatsapp', jsonb_build_object('user_id', u, 'template', 'viewing_reminder', 'booking_id', b.id),
                            v_slot - interval '2 hours')
    from unnest(array[b.tenant_id, b.host_id]) u;
    return b;

  -- Either side reschedules once: back to picking a time.
  elsif p_action = 'reschedule' and b.status = 'viewing_booked' then
    if b.reschedules >= 1 then perform private.fail('reschedule', 'A viewing can be moved once.'); end if;
    if v_host and p_payload ? 'slots' then
      select array_agg(x::timestamptz order by x::timestamptz) into v_slots
      from jsonb_array_elements_text(p_payload -> 'slots') x;
      update public.bookings set offered_slots = v_slots where id = b.id;
    end if;
    update public.bookings set reschedules = reschedules + 1, viewing_at = null where id = b.id;
    b := private.move(b, 'accepted', 'reschedule', v_uid,
                      now() + make_interval(hours => private.setting_int('pick_viewing_hours', 24)));
    perform private.notify(case when v_host then b.tenant_id else b.host_id end, 'viewing_rescheduled', b.id);
    return b;

  -- "They didn't show": closes the booking and counts against the no-show.
  elsif p_action = 'no_show' and b.status = 'viewing_booked' then
    if b.viewing_at > now() then perform private.fail('early', 'You can report a no-show after the viewing time.'); end if;
    v_who := case when v_host then b.tenant_id else b.host_id end;
    perform private.lower_standing(v_who, 10);
    return private.close(b, case when v_host then 'tenant_no_show' else 'host_no_show' end, v_uid);

  -- The viewing happened.
  elsif p_action = 'viewing_done' and b.status = 'viewing_booked' then
    if b.viewing_at > now() + interval '15 minutes' then perform private.fail('early', 'The viewing hasn''t started yet.'); end if;
    return private.move(b, 'viewed', 'viewing_done', v_uid,
                        now() + make_interval(hours => private.setting_int('viewed_hours', 48)));

  -- Tenant: did the room match the listing?
  elsif p_action = 'matched' and v_tenant and b.status = 'viewed' then
    update public.bookings set tenant_matched_at = now(), version = version + 1 where id = b.id returning * into b;
    insert into public.booking_events (booking_id, actor_id, action, from_status, to_status)
    values (b.id, v_uid, 'matched', b.status, b.status);
    perform private.notify(b.host_id, 'tenant_matched', b.id);
    return b;

  elsif p_action = 'mismatch' and v_tenant and b.status = 'viewed' then
    insert into public.reports (reporter_id, booking_id, listing_id, kind, details)
    values (v_uid, b.id, b.listing_id, 'not_as_listed', p_payload ->> 'details');
    return private.close(b, 'not_as_listed', v_uid);

  -- Host confirms the terms first; this locks agreement version N.
  elsif p_action = 'confirm_terms' and v_host and b.status = 'viewed' then
    if b.tenant_matched_at is null then perform private.fail('wait', 'Wait for the tenant to confirm the room matched.'); end if;
    v_terms := private.terms_for(b);
    insert into public.agreement_versions (booking_id, version, terms, terms_hash, host_confirmed_at)
    values (b.id, coalesce((select max(version) from public.agreement_versions where booking_id = b.id), 0) + 1,
            v_terms, encode(extensions.digest(v_terms::text, 'sha256'), 'hex'), now());
    b := private.move(b, 'host_confirmed', 'host_confirm_terms', v_uid,
                      now() + make_interval(hours => private.setting_int('confirm_hours', 24)));
    perform private.notify(b.tenant_id, 'agreement_ready', b.id);
    return b;

  -- Tenant confirms the same version.
  elsif p_action = 'confirm_terms' and v_tenant and b.status = 'host_confirmed' then
    select * into v_ver from public.agreement_versions where booking_id = b.id order by version desc limit 1;
    if (p_payload ->> 'terms_hash') is distinct from v_ver.terms_hash then
      perform private.fail('stale', 'The terms changed. Read them again before confirming.');
    end if;
    update public.agreement_versions set tenant_confirmed_at = now() where id = v_ver.id;
    b := private.move(b, 'agreed', 'tenant_confirm_terms', v_uid,
                      now() + make_interval(hours => private.setting_int('pay_hours', 24)));
    perform private.notify(b.tenant_id, 'pay_now', b.id);
    return b;

  -- Paid: tenant picks an arrival window for move-in day.
  elsif p_action = 'plan_arrival' and v_tenant and b.status = 'paid' then
    update public.bookings set arrival_window = p_payload ->> 'window', version = version + 1
    where id = b.id returning * into b;
    insert into public.booking_events (booking_id, actor_id, action, from_status, to_status, payload)
    values (b.id, v_uid, 'plan_arrival', b.status, b.status, p_payload);
    perform private.notify(b.host_id, 'arrival_planned', b.id, p_payload);
    return b;

  -- Paid: host cancels -> full refund, standing lowered.
  elsif p_action = 'host_cancel' and v_host and b.status = 'paid' then
    perform private.lower_standing(v_uid, 25);
    perform private.refund_all(b.id, 'host_cancelled');
    return private.close(b, 'host_cancelled', v_uid);

  -- Move-in day: "Is everything as listed?" comes first.
  elsif p_action = 'check_in' and v_tenant and b.status = 'paid' then
    if current_date < b.move_in - 1 then perform private.fail('early', 'Check in on your move-in day.'); end if;
    if coalesce((p_payload ->> 'as_listed')::boolean, false) then
      insert into public.check_ins (booking_id, as_listed, tenant_checked_in_at) values (b.id, true, now())
      on conflict (booking_id) do update set as_listed = true, tenant_checked_in_at = now();
      b := private.move(b, 'moved_in', 'check_in', v_uid,
                        now() + make_interval(hours => private.setting_int('move_in_confirm_hours', 24)));
      perform private.notify(b.host_id, 'confirm_move_in', b.id);
      return b;
    else
      insert into public.check_ins (booking_id, as_listed, problem) values (b.id, false, p_payload ->> 'problem')
      on conflict (booking_id) do update set as_listed = false, problem = excluded.problem;
      insert into public.reports (reporter_id, booking_id, listing_id, kind, details)
      values (v_uid, b.id, b.listing_id,
              case when p_payload ->> 'problem' = 'cant_get_in' then 'cant_get_in' else 'not_as_listed' end,
              p_payload ->> 'details');
      perform private.refund_all(b.id, coalesce(p_payload ->> 'problem', 'not_as_listed'));
      perform private.lower_standing(b.host_id, 25);
      return private.close(b, coalesce(p_payload ->> 'problem', 'not_as_listed'), v_uid);
    end if;

  elsif p_action = 'confirm_move_in' and v_host and b.status = 'moved_in' then
    update public.check_ins set host_confirmed_at = now() where booking_id = b.id;
    return private.move(b, 'active', 'host_confirm_move_in', v_uid, null);

  -- Leaving: tenant ends early with notice, or host asks to leave with the locked minimum.
  elsif p_action in ('end_early', 'ask_to_leave') and b.status = 'active'
        and ((p_action = 'end_early' and v_tenant) or (p_action = 'ask_to_leave' and v_host)) then
    select case when p_action = 'end_early' then l.early_leave_notice_days
                else greatest(l.ask_leave_notice_days, private.setting_int('min_notice_days', 7)) end
      into v_notice from public.listings l where l.id = b.listing_id;
    v_end := greatest(coalesce((p_payload ->> 'last_night')::date, current_date + v_notice), current_date + v_notice);
    if v_end >= b.move_out then v_end := b.move_out - 1; end if;
    update public.bookings set move_out = v_end + 1 where id = b.id;
    b := private.move(b, 'ending', p_action, v_uid, null, jsonb_build_object('last_night', v_end));
    perform private.notify(case when v_host then b.tenant_id else b.host_id end, 'stay_ending', b.id);
    return b;

  elsif p_action = 'move_out_done' and b.status = 'ending' then
    return private.move(b, 'moved_out', 'move_out_done', v_uid,
                        now() + make_interval(days => private.setting_int('move_out_settle_days', 7)));

  else
    perform private.fail('not_allowed', 'That step isn''t available right now.');
  end if;
  return b;
end $$;

create or replace function public.start_payment(p_booking uuid)
returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  b public.bookings;
  l public.listings;
  v_net bigint;
  v_pay public.payments;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.tenant_id is distinct from v_uid then perform private.fail('not_found', 'Booking not found.'); end if;
  if b.status <> 'agreed' then perform private.fail('not_allowed', 'This booking isn''t ready to pay.'); end if;
  if b.deadline_at < now() then perform private.fail('expired', 'The time to pay has passed.'); end if;
  select * into l from public.listings where id = b.listing_id;

  -- Short stay: the whole stay, no deposit. Monthly: first month + deposit. Lump sum: whole stay + deposit.
  v_net := case
    when b.weeks is not null then (b.weekly_price * b.weeks)::bigint * 100
    else (case when l.pay_schedule = 'lump_sum' then b.monthly_total * b.months else b.monthly_total end
          + coalesce(l.deposit, 0))::bigint * 100
  end;

  -- Reuse a pending payment so double taps don't create two.
  select * into v_pay from public.payments
  where booking_id = b.id and status = 'pending' and amount_kobo = v_net order by created_at desc limit 1;
  if v_pay.id is not null then return v_pay; end if;

  insert into public.payments (booking_id, payer_id, kind, amount_kobo, paystack_fee_kobo, bunkie_fee_kobo, paystack_reference)
  values (b.id, v_uid, 'booking', v_net, public.paystack_gross_kobo(v_net) - v_net, round(v_net * 0.02),
          'bk_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into v_pay;
  return v_pay;
end $$;

create or replace function public.room_address(p_booking uuid)
returns table (address_line text, landmark text, lat double precision, lng double precision)
language sql stable security definer set search_path = '' as $$
  select loc.address_line, loc.landmark, loc.lat, loc.lng
  from public.bookings b
  join public.listing_locations loc on loc.listing_id = b.listing_id
  where b.id = p_booking
    and (auth.uid() = b.host_id or (
         auth.uid() = b.tenant_id and (
           (not b.is_camp_booking and b.weeks is null and b.status in ('viewing_booked', 'viewed', 'host_confirmed', 'agreed',
                                                   'paid', 'moved_in', 'active', 'ending'))
           or ((b.is_camp_booking or b.weeks is not null) and b.status in ('paid', 'moved_in', 'active', 'ending')))))
$$;

create or replace function public.listing_missing(p_listing uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when loc.listing_id is null then 'location' end,
    case when (select count(distinct p.shot) from public.listing_photos p
               where p.listing_id = l.id and p.shot in ('bedroom', 'bathroom', 'kitchen', 'meter', 'entrance')) < 5
         then 'photos' end,
    case when coalesce(l.rent_monthly, 0) <= 0 then 'rent' end,
    case when l.open_to_short and coalesce(l.weekly_price, 0) <= 0 then 'weekly_price' end,
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

drop function public.search_rooms(text, date, smallint, double precision, double precision, int, int,
  public.share_pref, public.room_kind, text, int, int, int);
create or replace function public.search_rooms(
  p_mode text default 'any',              -- 'camp' | 'ppa' | 'any'
  p_move_in date default null,            -- camp mode: the camp exit date
  p_zone smallint default null,           -- PPA zone
  p_ppa_lat double precision default null,
  p_ppa_lng double precision default null,
  p_price_min int default 0,
  p_price_max int default 10000000,
  p_pref public.share_pref default 'mixed_ok',
  p_room public.room_kind default null,
  p_stay text default 'any',              -- 'weeks' (short stays) | 'short' (1-3 months) | 'long' (6-12) | 'any'
  p_max_minutes int default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  id uuid, area_name text, area_lat double precision, area_lng double precision,
  room_kind public.room_kind, bath_kind public.bath_kind, furnished boolean, household public.household,
  open_to_camp boolean, min_months smallint, max_months smallint, available_from date,
  monthly_total int, total_varies boolean, deposit int, pay_schedule public.pay_schedule,
  open_to_short boolean, weekly_price int,
  photo_count smallint, cover_path text,
  host_id uuid, host_first_name text, host_photo_path text, host_verified boolean, host_corper public.corper_status,
  host_answers jsonb, commute_min int, ease_min int, published_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  with base as (
    select l.*,
      case
        when p_zone is not null then coalesce(
          (select cm.minutes from public.commute_minutes cm where cm.listing_id = l.id and cm.zone_id = p_zone),
          (select public.estimate_minutes(l.area_lat, l.area_lng, z.lat, z.lng) from public.ppa_zones z where z.id = p_zone))
        when p_ppa_lat is not null then public.estimate_minutes(l.area_lat, l.area_lng, p_ppa_lat, p_ppa_lng)
      end as commute_min,
      coalesce((select avg(cm.minutes)::int from public.commute_minutes cm where cm.listing_id = l.id),
               public.estimate_minutes(l.area_lat, l.area_lng, 9.0579, 7.4951)) as ease_min   -- Central Area
    from public.listings l
    where l.status = 'live'
      and l.monthly_total between p_price_min and p_price_max
      and (p_room is null or l.room_kind = p_room)
      and (p_pref = 'mixed_ok' or (p_pref = 'women_only' and l.household = 'women') or (p_pref = 'men_only' and l.household = 'men'))
      and (p_stay = 'any' or (p_stay = 'weeks' and l.open_to_short) or (p_stay = 'short' and l.min_months <= 3)
           or (p_stay = 'long' and l.max_months >= 6))
      and (p_mode <> 'camp' or (l.open_to_camp and (l.min_months <= 3 or l.open_to_short)))
      and (p_move_in is null or l.available_from is null or l.available_from <= p_move_in)
      and (p_move_in is null or not exists (
            select 1 from public.bookings b
            where b.listing_id = l.id and b.status in ('paid', 'moved_in', 'active', 'ending')
              and b.stay @> p_move_in))
  )
  select b.id, b.area_name, b.area_lat, b.area_lng, b.room_kind, b.bath_kind, b.furnished, b.household,
         b.open_to_camp, b.min_months, b.max_months, b.available_from, b.monthly_total, b.total_varies,
         b.deposit, b.pay_schedule, b.open_to_short, case when b.open_to_short then b.weekly_price end,
         b.photo_count, b.cover_path,
         b.host_id, pr.first_name, pr.photo_path, pr.is_verified,
         case when pr.corper_verified then pr.corper_status end,
         case when a.user_id is null then null
              else jsonb_build_object('sleep', a.sleep, 'guests', a.guests, 'cooking', a.cooking,
                                      'cleaning', a.cleaning, 'noise', a.noise) end,
         b.commute_min, b.ease_min, b.published_at
  from base b
  join public.profiles pr on pr.id = b.host_id
  left join public.bunkie_answers a on a.user_id = b.host_id and a.approved_at is not null
  where p_max_minutes is null or b.commute_min is null or b.commute_min <= p_max_minutes
  -- Verified corp member hosts (serving or served) always come first, so new corpers land with
  -- someone who has been through NYSC. Within each group, the shortest commute first.
  order by
    case when pr.corper_verified and pr.corper_status in ('serving', 'served') then 0 else 1 end,
    case when p_mode = 'camp' then b.ease_min end nulls last,
    case when p_mode = 'ppa' then b.commute_min end nulls last,
    b.published_at desc
  limit least(p_limit, 60) offset p_offset
$$;
grant execute on function public.search_rooms(text, date, smallint, double precision, double precision, int, int,
  public.share_pref, public.room_kind, text, int, int, int) to anon, authenticated;
