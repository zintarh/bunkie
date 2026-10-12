-- Booking engine. The app never writes to bookings directly: it calls
--   request_room(listing, move_in, months)
--   booking_action(booking, action, expected_version, payload)
-- Edge Functions (service role) call the sys_* functions for payments, timers and jobs.
-- States and timers follow the Booking lifecycle spec.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.setting_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::int from public.settings where key = p_key), p_default)
$$;

create or replace function private.setting_bool(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean from public.settings where key = p_key), p_default)
$$;

create or replace function private.enqueue(p_queue text, p_payload jsonb, p_run_after timestamptz default now())
returns void language sql security definer set search_path = '' as $$
  insert into private.jobs (queue, payload, run_after) values (p_queue, p_payload, p_run_after)
$$;

create or replace function private.notify(p_user uuid, p_template text, p_booking uuid, p_data jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  select private.enqueue('whatsapp', jsonb_build_object(
    'user_id', p_user, 'template', p_template, 'booking_id', p_booking, 'data', p_data))
$$;

create or replace function private.fail(p_code text, p_message text) returns void
language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = p_message, detail = p_code;
end $$;

-- Paystack's local card fee (1.5% + ₦100, ₦100 waived under ₦2,500, capped at ₦2,000),
-- passed to the payer: returns what to charge so the host side still receives p_net.
create or replace function public.paystack_gross_kobo(p_net bigint) returns bigint
language plpgsql immutable as $$
declare
  v_gross bigint;
begin
  if p_net < 250000 then
    v_gross := ceil(p_net / 0.985);
  else
    v_gross := ceil((p_net + 10000) / 0.985);
  end if;
  if v_gross - p_net > 200000 then
    v_gross := p_net + 200000;
  end if;
  return v_gross;
end $$;

-- Applies a status change, bumps the version and records the event.
create or replace function private.move(
  p_booking public.bookings, p_to public.booking_status, p_action text, p_actor uuid,
  p_deadline timestamptz, p_payload jsonb default '{}'
) returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bookings;
begin
  update public.bookings set
    status = p_to,
    deadline_at = p_deadline,
    version = version + 1,
    closed_at = case when p_to = 'closed' then now() else closed_at end,
    close_reason = case when p_to = 'closed' then coalesce(p_payload ->> 'reason', p_action) else close_reason end
  where id = p_booking.id
  returning * into v_row;

  insert into public.booking_events (booking_id, actor_id, action, from_status, to_status, payload)
  values (p_booking.id, p_actor, p_action, p_booking.status, p_to, p_payload);
  return v_row;
end $$;

-- After a booking leaves the in-progress lane, requests waiting for that room get a fresh reply deadline.
create or replace function private.wake_waiting(p_listing uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_host uuid;
  v_n int;
begin
  if exists (select 1 from public.bookings
             where listing_id = p_listing
               and status in ('accepted', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed')) then
    return;
  end if;
  update public.bookings set deadline_at = now() + make_interval(hours => private.setting_int('host_reply_hours', 12))
  where listing_id = p_listing and status = 'requested' and deadline_at is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    select host_id into v_host from public.listings where id = p_listing;
    perform private.notify(v_host, 'requests_waiting', null, jsonb_build_object('listing_id', p_listing, 'count', v_n));
  end if;
end $$;

create or replace function private.close(p_booking public.bookings, p_reason text, p_actor uuid)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bookings;
  v_in_lane boolean := p_booking.status in ('accepted', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed');
begin
  v_row := private.move(p_booking, 'closed', p_reason, p_actor, null, jsonb_build_object('reason', p_reason));
  -- Tell whoever didn't close it.
  if p_actor is distinct from p_booking.tenant_id then
    perform private.notify(p_booking.tenant_id, 'booking_closed', p_booking.id, jsonb_build_object('reason', p_reason));
  end if;
  if p_actor is distinct from p_booking.host_id and p_booking.status <> 'requested' then
    perform private.notify(p_booking.host_id, 'booking_closed', p_booking.id, jsonb_build_object('reason', p_reason));
  end if;
  if v_in_lane then
    perform private.wake_waiting(p_booking.listing_id);
  end if;
  return v_row;
end $$;

create or replace function private.lower_standing(p_user uuid, p_points int) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set standing = greatest(0, standing - p_points) where id = p_user
$$;

-- Refund every successful payment on a booking that hasn't been paid out.
create or replace function private.refund_all(p_booking uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p record;
begin
  for p in
    select pay.* from public.payments pay
    where pay.booking_id = p_booking and pay.status = 'success'
      and not exists (select 1 from public.refunds r where r.payment_id = pay.id and r.status <> 'failed')
  loop
    update public.payouts set status = 'cancelled' where payment_id = p.id and status = 'scheduled';
    if exists (select 1 from public.payouts where payment_id = p.id and status in ('processing', 'done')) then
      continue;   -- already released to the host; handled by support
    end if;
    insert into public.refunds (payment_id, booking_id, amount_kobo, reason)
    values (p.id, p_booking, p.amount_kobo + p.paystack_fee_kobo, p_reason);
    perform private.enqueue('refund', jsonb_build_object('payment_id', p.id, 'reference', p.paystack_reference));
  end loop;
end $$;

-- Full terms snapshot for the agreement.
create or replace function private.terms_for(p_booking public.bookings) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'listing_id', l.id,
    'move_in', p_booking.move_in,
    'move_out', p_booking.move_out,
    'months', p_booking.months,
    'monthly_total', p_booking.monthly_total,
    'rent_monthly', l.rent_monthly,
    'deposit', coalesce(l.deposit, 0),
    'pay_schedule', l.pay_schedule,
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
      'ask_leave_notice_days', l.ask_leave_notice_days),
    'platform', jsonb_build_object(
      'payment_held_until_move_in', true,
      'min_notice_days', private.setting_int('min_notice_days', 7),
      'belongings_never_held', true,
      'host_cancel_full_refund', true)
  )
  from public.listings l where l.id = p_booking.listing_id
$$;

-- ---------------------------------------------------------------------------
-- request_room: the tenant's first step.
-- ---------------------------------------------------------------------------
create or replace function public.request_room(p_listing uuid, p_move_in date, p_months int)
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
  if p_months < v_l.min_months or p_months > v_l.max_months then
    perform private.fail('months', format('This room is for %s to %s months.', v_l.min_months, v_l.max_months));
  end if;
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
    if p_months > 3 then perform private.fail('camp', 'Camp bookings are 1 to 3 months.'); end if;
  end if;

  if exists (select 1 from public.bookings
             where listing_id = p_listing and status in ('paid', 'moved_in', 'active', 'ending')
               and stay && daterange(p_move_in, (p_move_in + make_interval(months => p_months))::date)) then
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

  insert into public.bookings (listing_id, tenant_id, host_id, is_camp_booking, move_in, months, move_out,
                               monthly_total, deadline_at)
  values (p_listing, v_uid, v_l.host_id, coalesce(v_me.nysc_stage = 'in_camp', false), p_move_in, p_months,
          (p_move_in + make_interval(months => p_months))::date, v_l.monthly_total,
          case when v_in_lane then null
               else now() + make_interval(hours => private.setting_int('host_reply_hours', 12)) end)
  returning * into v_row;

  insert into public.booking_events (booking_id, actor_id, action, to_status, payload)
  values (v_row.id, v_uid, 'request', 'requested', jsonb_build_object('move_in', p_move_in, 'months', p_months));
  perform private.notify(v_l.host_id, 'request_new', v_row.id);
  return v_row;
exception
  when unique_violation then
    perform private.fail('duplicate', 'You already have a request for this room.');
end $$;

-- ---------------------------------------------------------------------------
-- booking_action: every step after the request.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
-- The tenant starts paying; the Edge Function sends the returned amount to Paystack.
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

  -- Monthly: first month + deposit now. Lump sum: the whole stay + deposit.
  v_net := (case when l.pay_schedule = 'lump_sum' then b.monthly_total * b.months else b.monthly_total end
            + coalesce(l.deposit, 0))::bigint * 100;

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

-- Called by the Paystack webhook after the signature and amount are verified.
create or replace function public.sys_mark_paid(p_reference text, p_amount_kobo bigint, p_raw jsonb)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments;
  b public.bookings;
  o public.bookings;
begin
  select * into v_pay from public.payments where paystack_reference = p_reference for update;
  if v_pay.id is null then raise exception 'unknown reference %', p_reference; end if;
  select * into b from public.bookings where id = v_pay.booking_id for update;
  if v_pay.status = 'success' then return b; end if;          -- webhook repeated
  if p_amount_kobo < v_pay.amount_kobo + v_pay.paystack_fee_kobo then
    raise exception 'amount mismatch for %', p_reference;
  end if;

  update public.payments set status = 'success', paid_at = now(), raw = p_raw where id = v_pay.id;

  if b.status <> 'agreed' then
    -- Paid too late (booking closed meanwhile): give it straight back.
    perform private.refund_all(b.id, 'paid_after_close');
    return b;
  end if;

  begin
    b := private.move(b, 'paid', 'paid', null, null, jsonb_build_object('reference', p_reference));
  exception when exclusion_violation then
    perform private.refund_all(b.id, 'room_taken');
    return private.close(b, 'room_taken', null);
  end;

  -- The tenant's other open requests close; other requests for these dates on this room close.
  for o in select * from public.bookings
           where tenant_id = b.tenant_id and id <> b.id
             and status in ('requested', 'accepted', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed')
           for update
  loop
    perform private.close(o, 'booked_elsewhere', null);
  end loop;
  for o in select * from public.bookings
           where listing_id = b.listing_id and id <> b.id and stay && b.stay
             and status in ('requested', 'accepted', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed')
           for update
  loop
    perform private.close(o, 'room_taken', null);
  end loop;

  perform private.notify(b.tenant_id, 'booked', b.id);
  perform private.notify(b.host_id, 'booked', b.id);
  perform private.enqueue('whatsapp', jsonb_build_object('user_id', u, 'template', 'move_in_day', 'booking_id', b.id),
                          greatest(now(), (b.move_in + time '08:00') at time zone 'Africa/Lagos'))
  from unnest(array[b.tenant_id, b.host_id]) u;
  return b;
end $$;

create or replace function public.sys_mark_payment_failed(p_reference text, p_raw jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.payments set status = 'failed', raw = p_raw where paystack_reference = p_reference and status = 'pending'
$$;

-- ---------------------------------------------------------------------------
-- Timers: run every minute by pg_cron.
-- ---------------------------------------------------------------------------
create or replace function public.sys_expire_overdue(p_limit int default 500) returns int
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  v_n int := 0;
  v_pay public.payments;
begin
  for b in
    select * from public.bookings
    where deadline_at < now()
      and status in ('requested', 'accepted', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed', 'moved_in', 'moved_out')
    order by deadline_at
    limit p_limit
    for update skip locked
  loop
    v_n := v_n + 1;
    case b.status
      when 'requested' then perform private.close(b, 'host_no_reply', null);
      when 'accepted' then perform private.close(b, 'no_viewing_picked', null);
      when 'viewing_booked' then perform private.close(b, 'no_response', null);
      when 'viewed' then perform private.close(b, 'no_response', null);
      when 'host_confirmed' then perform private.close(b, 'tenant_no_confirm', null);
      when 'agreed' then perform private.close(b, 'not_paid', null);
      when 'moved_in' then
        -- Nobody reported a problem: the stay is active.
        perform private.move(b, 'active', 'auto_confirm_move_in', null, null);
      when 'moved_out' then
        perform private.move(b, 'completed', 'auto_settle', null, null);
      else null;
    end case;
  end loop;
  return v_n;
end $$;

-- Host payout is scheduled when the tenant checks in, released after the delay unless a problem is reported.
create or replace function private.schedule_payout() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments;
  v_after timestamptz := now() + make_interval(hours => private.setting_int('payout_delay_hours', 24));
begin
  if new.status = 'moved_in' and old.status = 'paid' then
    for v_pay in select * from public.payments where booking_id = new.id and status = 'success' loop
      insert into public.payouts (payment_id, booking_id, host_id, amount_kobo, release_after)
      values (v_pay.id, new.id, new.host_id, v_pay.amount_kobo - v_pay.bunkie_fee_kobo, v_after)
      on conflict (payment_id) do nothing;
      perform private.enqueue('payout', jsonb_build_object('payment_id', v_pay.id), v_after);
    end loop;
  end if;
  return null;
end $$;

create trigger schedule_payout after update of status on public.bookings
  for each row execute function private.schedule_payout();

-- ---------------------------------------------------------------------------
-- Jobs: claimed in batches by the worker Edge Function.
-- ---------------------------------------------------------------------------
create or replace function public.sys_claim_jobs(p_queue text, p_limit int default 50)
returns table (id bigint, payload jsonb, attempts smallint)
language sql security definer set search_path = '' as $$
  update private.jobs j set locked_until = now() + interval '2 minutes', attempts = j.attempts + 1
  where j.id in (
    select x.id from private.jobs x
    where x.queue = p_queue and x.done_at is null and not x.dead and x.run_after <= now()
      and (x.locked_until is null or x.locked_until < now())
    order by x.run_after
    limit p_limit
    for update skip locked
  )
  returning j.id, j.payload, j.attempts
$$;

create or replace function public.sys_finish_job(p_id bigint, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_attempts smallint;
begin
  if p_error is null then
    update private.jobs set done_at = now(), locked_until = null, last_error = null where id = p_id;
  else
    select attempts into v_attempts from private.jobs where id = p_id;
    update private.jobs set
      last_error = p_error,
      locked_until = null,
      dead = v_attempts >= 5,
      run_after = now() + make_interval(secs => 30 * power(2, v_attempts))   -- 1m, 2m, 4m, 8m...
    where id = p_id;
  end if;
end $$;

-- Payouts and refunds the worker settles with Paystack.
create or replace function public.sys_payout_ready(p_payment uuid)
returns table (payout_id uuid, amount_kobo bigint, subaccount_code text, booking_status public.booking_status, release_after timestamptz)
language sql security definer set search_path = '' as $$
  select po.id, po.amount_kobo, a.subaccount_code, b.status, po.release_after
  from public.payouts po
  join public.bookings b on b.id = po.booking_id
  left join public.host_payout_accounts a on a.host_id = po.host_id
  where po.payment_id = p_payment and po.status = 'scheduled'
    and not exists (select 1 from public.reports r where r.booking_id = b.id and r.status <> 'closed'
                    and r.kind in ('not_as_listed', 'cant_get_in', 'danger', 'payment'))
$$;

create or replace function public.sys_set_money_status(p_table text, p_id uuid, p_status public.money_move_status,
                                                       p_ref text default null, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_table = 'payouts' then
    update public.payouts set status = p_status, provider_ref = coalesce(p_ref, provider_ref), last_error = p_error where id = p_id;
  elsif p_table = 'refunds' then
    update public.refunds set status = p_status, provider_ref = coalesce(p_ref, provider_ref), last_error = p_error where id = p_id;
  else
    raise exception 'bad table';
  end if;
end $$;

-- Verification outcomes from the provider webhook.
create or replace function public.sys_record_verification(
  p_user uuid, p_kind text, p_passed boolean, p_provider text, p_ref text,
  p_masked_name text default null, p_gender public.gender default null, p_result jsonb default '{}'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_needed text[];
  v_is_host boolean;
begin
  insert into private.verifications (user_id, kind, status, provider, provider_ref, masked_name, result, decided_at)
  values (p_user, p_kind, case when p_passed then 'passed' else 'failed' end, p_provider, p_ref, p_masked_name, p_result, now());

  if p_kind = 'nin' and p_passed and p_gender is not null then
    update public.profile_private set gender = p_gender where user_id = p_user;
  end if;
  if p_kind = 'phone' and p_passed then
    update public.profile_private set phone_verified = true where user_id = p_user;
  end if;

  select is_host into v_is_host from public.profiles where id = p_user;
  v_needed := case when v_is_host then array['phone', 'nin', 'liveness', 'proof_of_address']
                   else array['phone', 'nin', 'liveness', 'call_up'] end;
  update public.profiles set is_verified = (
    select bool_and(exists (select 1 from private.verifications v
                            where v.user_id = p_user and v.kind = k and v.status = 'passed'))
    from unnest(v_needed) k)
  where id = p_user;
end $$;

-- What the signed-in user can see about their own checks.
create or replace function public.my_verification()
returns table (kind text, status text, masked_name text, decided_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (v.kind) v.kind, v.status, v.masked_name, v.decided_at
  from private.verifications v
  where v.user_id = auth.uid()
  order by v.kind, v.created_at desc
$$;

-- Exact address: host always; tenant once a viewing is booked (camp bookings: once paid).
create or replace function public.room_address(p_booking uuid)
returns table (address_line text, landmark text, lat double precision, lng double precision)
language sql stable security definer set search_path = '' as $$
  select loc.address_line, loc.landmark, loc.lat, loc.lng
  from public.bookings b
  join public.listing_locations loc on loc.listing_id = b.listing_id
  where b.id = p_booking
    and (auth.uid() = b.host_id or (
         auth.uid() = b.tenant_id and (
           (not b.is_camp_booking and b.status in ('viewing_booked', 'viewed', 'host_confirmed', 'agreed',
                                                   'paid', 'moved_in', 'active', 'ending'))
           or (b.is_camp_booking and b.status in ('paid', 'moved_in', 'active', 'ending')))))
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
revoke execute on function
  public.sys_mark_paid(text, bigint, jsonb),
  public.sys_mark_payment_failed(text, jsonb),
  public.sys_expire_overdue(int),
  public.sys_claim_jobs(text, int),
  public.sys_finish_job(bigint, text),
  public.sys_payout_ready(uuid),
  public.sys_set_money_status(text, uuid, public.money_move_status, text, text),
  public.sys_record_verification(uuid, text, boolean, text, text, text, public.gender, jsonb)
from public, anon, authenticated;

grant execute on function
  public.sys_mark_paid(text, bigint, jsonb),
  public.sys_mark_payment_failed(text, jsonb),
  public.sys_expire_overdue(int),
  public.sys_claim_jobs(text, int),
  public.sys_finish_job(bigint, text),
  public.sys_payout_ready(uuid),
  public.sys_set_money_status(text, uuid, public.money_move_status, text, text),
  public.sys_record_verification(uuid, text, boolean, text, text, text, public.gender, jsonb)
to service_role;

revoke execute on function public.request_room(uuid, date, int), public.booking_action(uuid, text, int, jsonb),
  public.start_payment(uuid), public.my_verification(), public.room_address(uuid)
from public, anon;
grant execute on function public.request_room(uuid, date, int), public.booking_action(uuid, text, int, jsonb),
  public.start_payment(uuid), public.my_verification(), public.room_address(uuid)
to authenticated;
