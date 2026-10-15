-- Inspections. A host offers free inspections or charges a fee (up to ₦5,000).
--  * The host accepts first; only then does the corper pick a time. For a paid in-person inspection
--    the booking waits in 'inspection_due' until the fee is paid in Bunkie (2 hours, then the time is
--    released). Video viewings are always free.
--  * Bunkie holds the fee. Refunded if the host declines, cancels, doesn't show, or the room isn't as
--    listed. The host keeps it if the corper doesn't show or cancels within 6 hours of the inspection.
--    Once the inspection happens the host's share is paid out after the usual delay.
--  * The fee comes off the corper's first payment if they book.
--  * One request per room is in progress at a time (the lane), now including 'inspection_due', so a
--    room can't take inspection fees from several people at once. The room shows as being viewed.

alter table public.listings add column inspection_fee int not null default 0 check (inspection_fee between 0 and 5000);
grant insert (inspection_fee), update (inspection_fee) on public.listings to authenticated;

alter table public.bookings
  add column inspection_fee int not null default 0,
  add column inspection_payment_id uuid references public.payments (id);

alter table public.payments drop constraint payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('booking', 'rent', 'inspection'));

insert into public.settings (key, value) values ('inspection_pay_hours', '2'), ('inspection_late_cancel_hours', '6')
on conflict (key) do nothing;

-- The lane and timers include the new step.
drop index public.one_live_request_per_room;
create unique index one_live_request_per_room on public.bookings (listing_id)
  where status in ('accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed');
drop index public.one_open_request_per_tenant_room;
create unique index one_open_request_per_tenant_room on public.bookings (listing_id, tenant_id)
  where status in ('requested', 'accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed');
drop index public.bookings_deadline_idx;
create index bookings_deadline_idx on public.bookings (deadline_at)
  where status in ('requested', 'accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed', 'moved_in', 'moved_out');

-- The fee is fixed when the request is made (in-person inspections only; video is free).
create or replace function private.booking_inspection_fee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.inspection_fee := coalesce((select l.inspection_fee from public.listings l where l.id = new.listing_id), 0);
  return new;
end $$;
create trigger booking_inspection_fee before insert on public.bookings
  for each row execute function private.booking_inspection_fee();

-- Refund one payment (unless it was already paid out to the host).
create or replace function private.refund_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  select * into p from public.payments where id = p_payment and status = 'success';
  if p.id is null or exists (select 1 from public.refunds r where r.payment_id = p.id and r.status <> 'failed') then return; end if;
  update public.payouts set status = 'cancelled' where payment_id = p.id and status = 'scheduled';
  if exists (select 1 from public.payouts where payment_id = p.id and status in ('processing', 'done')) then return; end if;
  insert into public.refunds (payment_id, booking_id, amount_kobo, reason)
  values (p.id, p.booking_id, p.amount_kobo + p.paystack_fee_kobo, p_reason);
  perform private.enqueue('refund', jsonb_build_object('payment_id', p.id, 'reference', p.paystack_reference));
end $$;

-- Pays the host's share of the inspection fee after the usual delay.
create or replace function private.pay_out_inspection(p_booking public.bookings) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  v_after timestamptz := now() + make_interval(hours => private.setting_int('payout_delay_hours', 24));
begin
  select * into p from public.payments where id = p_booking.inspection_payment_id and status = 'success';
  if p.id is null or exists (select 1 from public.refunds r where r.payment_id = p.id and r.status <> 'failed') then return; end if;
  insert into public.payouts (payment_id, booking_id, host_id, amount_kobo, release_after)
  values (p.id, p_booking.id, p_booking.host_id, p.amount_kobo - p.bunkie_fee_kobo, v_after)
  on conflict (payment_id) do nothing;
  perform private.enqueue('payout', jsonb_build_object('payment_id', p.id), v_after);
end $$;

-- Who gets the inspection fee, decided when the inspection happens or the booking closes.
create or replace function private.settle_inspection() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := new.close_reason;
  v_late boolean;
begin
  if new.inspection_payment_id is null or new.status = old.status then return null; end if;

  if new.status = 'viewed' and old.status = 'viewing_booked' then
    perform private.pay_out_inspection(new);           -- the inspection happened
  elsif new.status = 'closed' then
    v_late := old.viewing_at is not null
              and old.viewing_at - now() < make_interval(hours => private.setting_int('inspection_late_cancel_hours', 6));
    if v_reason = 'not_as_listed' then
      perform private.refund_payment(new.inspection_payment_id, 'not_as_listed');
    elsif old.status = 'viewing_booked' then           -- closed before the inspection happened
      if v_reason = 'tenant_no_show' or (v_reason = 'withdrawn' and v_late) then
        perform private.pay_out_inspection(new);
      else
        perform private.refund_payment(new.inspection_payment_id, coalesce(v_reason, 'closed'));
      end if;
    end if;
  end if;
  return null;
end $$;
create trigger settle_inspection after update of status on public.bookings
  for each row execute function private.settle_inspection();

-- When the room is next free from inspections (null: nobody is viewing it).
create or replace function private.listing_hold(p_listing uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(case
    when b.status = 'viewing_booked' then b.viewing_at + make_interval(hours => private.setting_int('viewed_hours', 48))
    else b.deadline_at end)
  from public.bookings b
  where b.listing_id = p_listing and b.status in ('inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed')
$$;
create or replace function public.listing_hold(p_listing uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$ select private.listing_hold(p_listing) $$;
grant execute on function public.listing_hold(uuid) to anon, authenticated;

create or replace function private.wake_waiting(p_listing uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_host uuid;
  v_n int;
begin
  if exists (select 1 from public.bookings
             where listing_id = p_listing
               and status in ('accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed')) then
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
  v_in_lane boolean := p_booking.status in ('accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed');
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
  where tenant_id = v_uid and status in ('requested', 'accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed');
  if v_open >= private.setting_int('max_open_requests', 3) then
    perform private.fail('limit', format('You can have %s open requests. Withdraw one to send another.',
                                         private.setting_int('max_open_requests', 3)));
  end if;

  v_in_lane := exists (select 1 from public.bookings where listing_id = p_listing
                       and status in ('accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed'));

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

create or replace function public.start_payment(p_booking uuid)
returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  b public.bookings;
  l public.listings;
  v_net bigint;
  v_pay public.payments;
  v_kind text := 'booking';
  v_credit bigint := 0;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.tenant_id is distinct from v_uid then perform private.fail('not_found', 'Booking not found.'); end if;
  if b.status not in ('agreed', 'inspection_due') then perform private.fail('not_allowed', 'This booking isn''t ready to pay.'); end if;
  if b.deadline_at < now() then perform private.fail('expired', 'The time to pay has passed.'); end if;
  select * into l from public.listings where id = b.listing_id;

  -- Inspection fee: paid before the viewing, held by Bunkie, later counted toward the first payment.
  if b.status = 'inspection_due' then
    if b.inspection_fee <= 0 then perform private.fail('not_allowed', 'This inspection is free.'); end if;
    v_kind := 'inspection';
    v_net := b.inspection_fee::bigint * 100;
  else
  -- Short stay: the whole stay, no deposit. Monthly: first month + deposit. Lump sum: whole stay + deposit.
  v_net := case
    when b.weeks is not null then (b.weekly_price * b.weeks)::bigint * 100
    else (case when l.pay_schedule = 'lump_sum' then b.monthly_total * b.months else b.monthly_total end
          + coalesce(l.deposit, 0))::bigint * 100
  end;
    -- What the corper already paid for the inspection comes off the first payment.
    select coalesce(sum(amount_kobo), 0) into v_credit from public.payments
    where booking_id = b.id and kind = 'inspection' and status = 'success'
      and not exists (select 1 from public.refunds r where r.payment_id = payments.id and r.status <> 'failed');
    v_net := greatest(v_net - v_credit, 10000);
  end if;

  -- Reuse a pending payment so double taps don't create two.
  select * into v_pay from public.payments
  where booking_id = b.id and status = 'pending' and kind = v_kind and amount_kobo = v_net order by created_at desc limit 1;
  if v_pay.id is not null then return v_pay; end if;

  insert into public.payments (booking_id, payer_id, kind, amount_kobo, paystack_fee_kobo, bunkie_fee_kobo, paystack_reference)
  values (b.id, v_uid, v_kind, v_net, public.paystack_gross_kobo(v_net) - v_net, round(v_net * 0.02),
          'bk_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into v_pay;
  return v_pay;
end $$;

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

  -- Inspection fee paid: the viewing is confirmed.
  if v_pay.kind = 'inspection' then
    if b.status <> 'inspection_due' then
      perform private.refund_payment(v_pay.id, 'paid_after_close');
      return b;
    end if;
    update public.bookings set inspection_payment_id = v_pay.id where id = b.id;
    b := private.move(b, 'viewing_booked', 'inspection_paid', null,
                      b.viewing_at + make_interval(hours => private.setting_int('viewed_hours', 48)),
                      jsonb_build_object('reference', p_reference, 'at', b.viewing_at, 'mode', b.viewing_mode));
    perform private.notify(b.host_id, 'viewing_booked', b.id);
    perform private.notify(b.tenant_id, 'viewing_booked', b.id);
    perform private.enqueue('whatsapp', jsonb_build_object('user_id', u, 'template', 'viewing_reminder', 'booking_id', b.id),
                            b.viewing_at - interval '2 hours')
    from unnest(array[b.tenant_id, b.host_id]) u;
    return b;
  end if;

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
             and status in ('requested', 'accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed')
           for update
  loop
    perform private.close(o, 'booked_elsewhere', null);
  end loop;
  for o in select * from public.bookings
           where listing_id = b.listing_id and id <> b.id and stay && b.stay
             and status in ('requested', 'accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed')
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
      and status in ('requested', 'accepted', 'inspection_due', 'viewing_booked', 'viewed', 'host_confirmed', 'agreed', 'moved_in', 'moved_out')
    order by deadline_at
    limit p_limit
    for update skip locked
  loop
    v_n := v_n + 1;
    case b.status
      when 'requested' then perform private.close(b, 'host_no_reply', null);
      when 'accepted' then perform private.close(b, 'no_viewing_picked', null);
      when 'inspection_due' then
        -- Fee not paid in time: the time is released and they can pick again.
        update public.bookings set viewing_at = null where id = b.id;
        perform private.move(b, 'accepted', 'inspection_not_paid', null,
                             now() + make_interval(hours => private.setting_int('pick_viewing_hours', 24)));
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

create or replace function private.booking_event_to_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
  v_text text;
begin
  if new.action = 'request' then return null; end if;   -- posted by booking_to_chat
  select c.id into v_conv from public.conversations c where c.booking_id = new.booking_id;
  if v_conv is null then return null; end if;
  v_text := case
    when new.to_status = 'accepted' then 'Request accepted. Pick a viewing time.'
    when new.to_status = 'inspection_due' then 'Inspection time picked. Pay the inspection fee to confirm it.'
    when new.action = 'inspection_not_paid' then 'Inspection fee not paid in time. Pick a time again.'
    when new.to_status = 'viewing_booked' and new.action = 'inspection_paid' then 'Inspection fee paid. Inspection booked.'
    when new.to_status = 'viewing_booked' then 'Viewing booked'
    when new.action = 'reschedule' then 'Viewing moved. Pick a new time.'
    when new.to_status = 'viewed' then 'Viewing done'
    when new.to_status = 'host_confirmed' then 'Agreement ready to confirm'
    when new.to_status = 'agreed' then 'Agreement confirmed. Pay to lock the room.'
    when new.to_status = 'paid' then 'Paid. Contact details are now visible.'
    when new.to_status = 'moved_in' then 'Checked in'
    when new.to_status = 'active' then 'Move-in confirmed'
    when new.to_status = 'ending' then 'Notice given'
    when new.to_status = 'moved_out' then 'Moved out'
    when new.to_status = 'closed' then 'Booking closed'
  end;
  if new.to_status = 'paid' then
    update public.conversations set contacts_unlocked = true where id = v_conv;
  end if;
  if v_text is not null then
    perform private.post_system(v_conv, v_text, jsonb_build_object('type', 'booking', 'booking_id', new.booking_id,
                                                                   'action', new.action, 'status', new.to_status));
  end if;
  return null;
end $$;

drop function public.find_rooms(text, date, double precision, double precision, smallint, int,
  public.share_pref, public.room_kind, text, int, int);
create or replace function public.find_rooms(
  p_mode text default 'any',               -- 'camp' | 'ppa' | 'any'
  p_move_in date default null,             -- camp exit day, or the move-in the person picked
  p_lat double precision default null,     -- exact search point (their PPA), when known
  p_lng double precision default null,
  p_zone smallint default null,            -- nearest PPA zone (for Google drive times)
  p_budget_max int default null,           -- monthly, all in
  p_pref public.share_pref default 'mixed_ok',
  p_room public.room_kind default null,
  p_stay text default 'any',               -- 'weeks' | 'short' (1-3 months) | 'long' (6-12) | 'any'
  p_max_minutes int default null,
  p_limit int default 40
)
returns table (
  id uuid, area_name text, area_lat double precision, area_lng double precision,
  room_kind public.room_kind, bath_kind public.bath_kind, furnished boolean, household public.household,
  open_to_camp boolean, min_months smallint, max_months smallint, available_from date,
  monthly_total int, total_varies boolean, deposit int, pay_schedule public.pay_schedule,
  open_to_short boolean, weekly_price int, photo_count smallint, cover_path text,
  host_id uuid, host_first_name text, host_photo_path text, host_verified boolean, host_corper public.corper_status,
  host_answers jsonb, commute_min int, ease_min int, published_at timestamptz,
  free_from date, match_score int, exact boolean, misses jsonb, inspection_fee int, being_viewed_until timestamptz
)
language sql stable security definer set search_path = '' as $$
  with params as (
    select
      coalesce(p_move_in, current_date) as want,
      -- How far past the ask a near miss may go.
      case when p_budget_max is null then null else greatest(p_budget_max * 0.25, 10000)::int end as budget_slack,
      case when p_mode = 'camp' then 14 else 30 end as later_slack,
      20 as minutes_slack,
      -- Without a commute limit, near misses still stay within reach of the search point.
      coalesce(p_max_minutes, 45) as reach
  ),
  base as (
    select l.*,
      -- Booked over the wanted date: free again when that stay ends.
      greatest(l.available_from, (select max(upper(b.stay)) from public.bookings b
                                  where b.listing_id = l.id and b.status in ('paid', 'moved_in', 'active', 'ending')
                                    and b.stay @> (select want from params))) as free_from,
      case
        when p_lat is not null then coalesce(
          -- Google drive time for the zone when the search point is close to that zone's centre.
          (select cm.minutes from public.commute_minutes cm join public.ppa_zones z on z.id = cm.zone_id
           where cm.listing_id = l.id and cm.zone_id = p_zone
             and public.distance_m(z.lat, z.lng, p_lat, p_lng) < 1500),
          public.estimate_minutes(l.area_lat, l.area_lng, p_lat, p_lng))
        when p_zone is not null then coalesce(
          (select cm.minutes from public.commute_minutes cm where cm.listing_id = l.id and cm.zone_id = p_zone),
          (select public.estimate_minutes(l.area_lat, l.area_lng, z.lat, z.lng) from public.ppa_zones z where z.id = p_zone))
      end as commute_min,
      coalesce((select avg(cm.minutes)::int from public.commute_minutes cm where cm.listing_id = l.id),
               public.estimate_minutes(l.area_lat, l.area_lng, 9.0579, 7.4951)) as ease_min,   -- Central Area
      -- What the person compares with their monthly budget.
      case when p_stay = 'weeks' and l.open_to_short then l.weekly_price * 4 else l.monthly_total end as price_basis
    from public.listings l
    where l.status = 'live'
      -- Dealbreakers.
      and (p_pref = 'mixed_ok' or (p_pref = 'women_only' and l.household = 'women') or (p_pref = 'men_only' and l.household = 'men'))
      and (p_mode <> 'camp' or (l.open_to_camp and (l.min_months <= 3 or l.open_to_short)))
  ),
  checked as (
    select b.*, (select want from params) as want,
      jsonb_build_array(
        case when p_budget_max is not null and b.price_basis > p_budget_max
             then jsonb_build_object('kind', 'over_budget', 'by', b.price_basis - p_budget_max) end,
        case when p_move_in is not null and b.free_from is not null and b.free_from > p_move_in
             then jsonb_build_object('kind', 'later', 'days', b.free_from - p_move_in, 'on', b.free_from) end,
        case when p_max_minutes is not null and b.commute_min > p_max_minutes
             then jsonb_build_object('kind', 'farther', 'minutes', b.commute_min) end,
        case when p_room is not null and b.room_kind <> p_room
             then jsonb_build_object('kind', 'room', 'is', b.room_kind) end,
        case when p_stay = 'weeks' and not b.open_to_short then jsonb_build_object('kind', 'no_short') end,
        case when p_stay = 'short' and b.min_months > 3 and not b.open_to_short
             then jsonb_build_object('kind', 'min_stay', 'months', b.min_months) end,
        case when p_stay = 'long' and b.max_months < 6 then jsonb_build_object('kind', 'max_stay', 'months', b.max_months) end
      ) as raw_misses
    from base b, params
    -- Beyond the allowances it isn't a near miss any more.
    where (p_budget_max is null or b.price_basis <= p_budget_max + params.budget_slack)
      and (p_move_in is null or b.free_from is null or b.free_from <= p_move_in + params.later_slack)
      and (b.commute_min is null or b.commute_min <= greatest(params.reach, coalesce(p_max_minutes, 0) + params.minutes_slack)
           or (p_lat is null and p_zone is null))
  ),
  scored as (
    select c.*,
      (select coalesce(jsonb_agg(m), '[]') from jsonb_array_elements(c.raw_misses) m where m <> 'null') as miss_list
    from checked c
  )
  select r.* from (
  select s.id, s.area_name, s.area_lat, s.area_lng, s.room_kind, s.bath_kind, s.furnished, s.household,
         s.open_to_camp, s.min_months, s.max_months, s.available_from, s.monthly_total, s.total_varies,
         s.deposit, s.pay_schedule, s.open_to_short, case when s.open_to_short then s.weekly_price end,
         s.photo_count, s.cover_path,
         s.host_id, pr.first_name, pr.photo_path, pr.is_verified,
         case when pr.corper_verified then pr.corper_status end,
         case when a.user_id is null then null
              else jsonb_build_object('sleep', a.sleep, 'guests', a.guests, 'cooking', a.cooking,
                                      'cleaning', a.cleaning, 'noise', a.noise) end,
         s.commute_min, s.ease_min, s.published_at, s.free_from,
         greatest(0, least(100, round(
             -- Commute (or, in camp, how central it is): the biggest part.
             40 * exp(-coalesce(case when p_mode = 'camp' then s.ease_min else s.commute_min end, 20) / 25.0)
             -- Price against budget: within budget scores well, cheaper a little better; over budget fades out.
           + case when p_budget_max is null then 10
                  when s.price_basis <= p_budget_max then 15 - 5 * (s.price_basis::numeric / greatest(p_budget_max, 1))
                  else 10 * greatest(0, 1 - (s.price_basis - p_budget_max)::numeric / greatest(p_budget_max * 0.25, 10000)) end
           + case when pr.corper_verified and pr.corper_status in ('serving', 'served') then 12 else 0 end
           + case when pr.is_verified then 5 else 0 end
           + case when s.free_from is null or s.free_from <= s.want then 5
                  when p_move_in is null then 5 * exp(-(s.free_from - s.want) / 30.0) else 0 end
           + 5 * exp(-extract(epoch from now() - s.published_at) / 86400 / 30.0)
           + case when s.photo_count >= 6 then 2 else 0 end
           - 8 * jsonb_array_length(s.miss_list)
         )))::int,
         jsonb_array_length(s.miss_list) = 0,
         s.miss_list,
         s.inspection_fee,
         private.listing_hold(s.id)
  from scored s
  join public.profiles pr on pr.id = s.host_id
  left join public.bunkie_answers a on a.user_id = s.host_id and a.approved_at is not null
  ) r (id, area_name, area_lat, area_lng, room_kind, bath_kind, furnished, household, open_to_camp, min_months,
       max_months, available_from, monthly_total, total_varies, deposit, pay_schedule, open_to_short, weekly_price,
       photo_count, cover_path, host_id, host_first_name, host_photo_path, host_verified, host_corper, host_answers,
       commute_min, ease_min, published_at, free_from, match_score, exact, misses, inspection_fee, being_viewed_until)
  order by r.exact desc, r.match_score desc, r.published_at desc
  limit least(p_limit, 60)
$$;
grant execute on function public.find_rooms(text, date, double precision, double precision, smallint, int,
  public.share_pref, public.room_kind, text, int, int) to anon, authenticated;
