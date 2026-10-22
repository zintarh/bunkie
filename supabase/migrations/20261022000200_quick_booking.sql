-- Quicker booking: request -> host accepts -> corper agrees and pays. One wait instead of six.
-- Viewing times become optional (the host can still offer them); the money is held until move-in
-- and "Is everything as listed?" on move-in day refunds in full.

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
     and b.status in ('requested', 'accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed') then
    return private.close(b, 'withdrawn', v_uid);

  -- Host declines before terms are agreed.
  elsif p_action = 'decline' and v_host and b.status in ('requested', 'accepted', 'inspection_due', 'viewing_booked', 'viewed') then
    return private.close(b, 'host_declined', v_uid);

  -- Accept: the agreement is ready straight away and the corper agrees and pays. A viewing is
  -- optional (the host offers times instead, below); move-in day's "Is everything as listed?"
  -- refunds in full if the room isn't what was shown.
  elsif p_action = 'accept' and v_host and b.status = 'requested'
        and jsonb_array_length(coalesce(p_payload -> 'slots', '[]')) = 0 then
    v_terms := private.terms_for(b);
    begin
      insert into public.agreement_versions (booking_id, version, terms, terms_hash, host_confirmed_at)
      values (b.id, coalesce((select max(version) from public.agreement_versions where booking_id = b.id), 0) + 1,
              v_terms, encode(extensions.digest(v_terms::text, 'sha256'), 'hex'), now());
      b := private.move(b, 'host_confirmed', 'accept', v_uid,
                        now() + make_interval(hours => private.setting_int('confirm_hours', 24)));
    exception when unique_violation then
      perform private.fail('room_busy', 'You''re already going ahead with another request for this room. Finish or close it first.');
    end;
    update public.bookings set deadline_at = null
    where listing_id = b.listing_id and status = 'requested' and id <> b.id;
    perform private.notify(b.tenant_id, 'accepted_pay', b.id);
    return b;

  -- Host accepts and offers viewing times first (optional).
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
    -- Paid in-person inspection: hold the time and ask for the fee first (video viewings are free).
    if b.inspection_fee > 0 and v_mode = 'in_person' and b.inspection_payment_id is null then
      update public.bookings set viewing_at = v_slot, viewing_mode = v_mode where id = b.id;
      b := private.move(b, 'inspection_due', 'book_inspection', v_uid,
                        greatest(now() + interval '15 minutes',
                                 least(now() + make_interval(hours => private.setting_int('inspection_pay_hours', 2)),
                                       v_slot - interval '30 minutes')),
                        jsonb_build_object('at', v_slot, 'fee', b.inspection_fee));
      perform private.notify(b.tenant_id, 'pay_inspection', b.id);
      return b;
    end if;
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

  -- Before paying the inspection fee, the corper can pick a different time.
  elsif p_action = 'change_time' and v_tenant and b.status = 'inspection_due' then
    update public.bookings set viewing_at = null where id = b.id;
    return private.move(b, 'accepted', 'change_time', v_uid,
                        now() + make_interval(hours => private.setting_int('pick_viewing_hours', 24)));

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
