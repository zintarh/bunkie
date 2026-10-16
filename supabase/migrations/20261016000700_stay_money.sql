-- Money through the stay.
--  * The first payment records its parts: rent and caution deposit.
--  * Rent is released to the host period by period (weeks for short stays, months otherwise), each at
--    the start of its period (the first 24 hours after move-in). The deposit is never released with rent.
--  * Leaving early: periods after the new last night that haven't been released go back to the corper.
--  * Monthly stays: each later month is paid in Bunkie (from 7 days before it starts) and released
--    24 hours into that month.
--  * Move-out: the host keeps the deposit whole or proposes a deduction with a reason within the
--    settle window; the corper accepts or disputes (a dispute goes to the team). No proposal, or no
--    answer by the end of the window: it settles as it stands. Settling refunds the corper and pays
--    any agreed deduction to the host.

alter table public.payments
  add column rent_kobo bigint not null default 0,
  add column deposit_kobo bigint not null default 0,
  add column period_start date;
alter table public.payments drop constraint payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('booking', 'rent', 'inspection'));
-- Payments made before this split: all rent (deposits weren't split out).
update public.payments set rent_kobo = amount_kobo where rent_kobo = 0 and kind <> 'inspection';

alter table public.payouts
  add column kind text not null default 'rent' check (kind in ('rent', 'deposit', 'inspection')),
  add column period_start date,
  add column period_end date,
  add column gross_kobo bigint;                       -- before Bunkie's 2%: what a refund of it would return
alter table public.payouts drop constraint payouts_payment_id_key;
create unique index payouts_period_key on public.payouts (payment_id, kind, coalesce(period_start, '1900-01-01'));

create table public.deposit_settlements (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  deposit_kobo bigint not null,
  deduction_kobo bigint not null default 0 check (deduction_kobo >= 0),
  reason text check (char_length(reason) <= 1000),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'disputed', 'settled')),
  proposed_at timestamptz not null default now(),
  responded_at timestamptz,
  settled_at timestamptz,
  check (deduction_kobo <= deposit_kobo)
);
alter table public.deposit_settlements enable row level security;
revoke all on public.deposit_settlements from anon, authenticated;
grant select on public.deposit_settlements to authenticated;
create policy "parties" on public.deposit_settlements for select to authenticated using ((select private.is_party(booking_id)));

-- ---------------------------------------------------------------------------
-- Payouts by period
-- ---------------------------------------------------------------------------
-- One payout of a payment's share for a period; Bunkie keeps 2% of rent and inspection fees.
create or replace function private.schedule_period(
  b public.bookings, p public.payments, p_kind text, p_start date, p_end date, p_gross bigint, p_after timestamptz
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_gross <= 0 then return; end if;
  insert into public.payouts (payment_id, booking_id, host_id, amount_kobo, gross_kobo, release_after, kind, period_start, period_end)
  values (p.id, b.id, b.host_id, p_gross - case when p_kind = 'deposit' then 0 else round(p_gross * 0.02) end, p_gross,
          p_after, p_kind, p_start, p_end)
  on conflict do nothing
  returning id into v_id;
  if v_id is not null then
    perform private.enqueue('payout', jsonb_build_object('payout_id', v_id, 'payment_id', p.id), p_after);
  end if;
end $$;

-- At move-in: the first payment's rent, split into its periods.
create or replace function private.schedule_payout() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  v_n int;
  v_step interval;
  v_each bigint;
  v_start date;
  v_delay interval := make_interval(hours => private.setting_int('payout_delay_hours', 24));
  i int;
begin
  if not (new.status = 'moved_in' and old.status = 'paid') then return null; end if;
  select * into p from public.payments where booking_id = new.id and kind = 'booking' and status = 'success'
  order by paid_at desc limit 1;
  if p.id is null then return null; end if;

  v_n := case when new.weeks is not null then new.weeks
              when (select pay_schedule from public.listings where id = new.listing_id) = 'lump_sum' then coalesce(new.months, 1)
              else 1 end;
  v_step := case when new.weeks is not null then interval '7 days' else interval '1 month' end;
  v_each := p.rent_kobo / v_n;
  for i in 0 .. v_n - 1 loop
    v_start := (new.move_in + i * v_step)::date;
    perform private.schedule_period(new, p, 'rent', v_start, least((v_start + v_step)::date, new.move_out),
      case when i = v_n - 1 then p.rent_kobo - v_each * (v_n - 1) else v_each end,
      greatest(now(), (v_start::timestamp at time zone 'Africa/Lagos')) + v_delay);
  end loop;
  return null;
end $$;

-- Payouts the worker may send now (one payout, not a whole payment).
create or replace function public.sys_payout_due(p_payout uuid)
returns table (payout_id uuid, amount_kobo bigint, recipient_code text, kind text, booking_status public.booking_status, release_after timestamptz)
language sql security definer set search_path = '' as $$
  select po.id, po.amount_kobo, a.recipient_code, po.kind, b.status, po.release_after
  from public.payouts po
  join public.bookings b on b.id = po.booking_id
  left join public.host_payout_accounts a on a.host_id = po.host_id
  where po.id = p_payout and po.status = 'scheduled'
    and not exists (select 1 from public.reports r where r.booking_id = b.id and r.status <> 'closed'
                    and r.kind in ('not_as_listed', 'cant_get_in', 'danger', 'payment'))
$$;
revoke execute on function public.sys_payout_due(uuid) from public, anon, authenticated;
grant execute on function public.sys_payout_due(uuid) to service_role;

-- Part of a payment back to the corper.
create or replace function private.refund_part(p_payment uuid, p_amount bigint, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  if p_amount <= 0 then return; end if;
  select * into p from public.payments where id = p_payment and status = 'success';
  if p.id is null then return; end if;
  insert into public.refunds (payment_id, booking_id, amount_kobo, reason) values (p.id, p.booking_id, p_amount, p_reason);
  perform private.enqueue('refund', jsonb_build_object('payment_id', p.id, 'reference', p.paystack_reference));
end $$;

-- Leaving early: unreleased periods after the new last night go back to the corper.
create or replace function private.refund_unused_periods() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  -- Runs when the stay becomes 'ending' (the new last night is already set) or the end moves earlier.
  if new.status <> 'ending' or (old.status = 'ending' and new.move_out >= old.move_out) then return null; end if;
  for r in update public.payouts set status = 'cancelled'
           where booking_id = new.id and kind = 'rent' and status = 'scheduled' and period_start >= new.move_out
           returning payment_id, gross_kobo loop
    perform private.refund_part(r.payment_id, r.gross_kobo, 'left_early');
  end loop;
  return null;
end $$;
create trigger refund_unused_periods after update of move_out, status on public.bookings
  for each row execute function private.refund_unused_periods();

create or replace function private.pay_out_inspection(p_booking public.bookings) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  v_after timestamptz := now() + make_interval(hours => private.setting_int('payout_delay_hours', 24));
begin
  select * into p from public.payments where id = p_booking.inspection_payment_id and status = 'success';
  if p.id is null or exists (select 1 from public.refunds r where r.payment_id = p.id and r.status <> 'failed') then return; end if;
  perform private.schedule_period(p_booking, p, 'inspection', null, null, p.amount_kobo, v_after);
end $$;

-- ---------------------------------------------------------------------------
-- Monthly rent
-- ---------------------------------------------------------------------------
-- The start of the next month not yet paid (monthly stays only), or null.
create or replace function private.next_rent_period(b public.bookings) returns date
language sql stable security definer set search_path = '' as $$
  select min(s)::date from generate_series(1, greatest(coalesce(b.months, 1) - 1, 0)) i,
    lateral (select (b.move_in + make_interval(months => i))::date s) x
  where b.weeks is null and b.months > 1
    and (select pay_schedule from public.listings where id = b.listing_id) = 'monthly'
    and s < b.move_out
    and not exists (select 1 from public.payments p where p.booking_id = b.id and p.kind = 'rent'
                    and p.status = 'success' and p.period_start = s)
$$;

-- What the booking page shows for rent: next month due, how much, whether it's late.
create or replace function public.rent_status(p_booking uuid)
returns table (next_period date, amount int, due date, late boolean, paid_months int, total_months int)
language plpgsql stable security definer set search_path = '' as $$
declare
  b public.bookings;
  v_next date;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or auth.uid() not in (b.tenant_id, b.host_id) then return; end if;
  v_next := private.next_rent_period(b);
  return query select v_next, b.monthly_total, v_next, v_next is not null and v_next < current_date,
    1 + (select count(*)::int from public.payments p where p.booking_id = b.id and p.kind = 'rent' and p.status = 'success'),
    coalesce(b.months, 1);
end $$;
revoke execute on function public.rent_status(uuid) from public, anon;
grant execute on function public.rent_status(uuid) to authenticated;

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
  v_rent bigint := 0;
  v_deposit bigint := 0;
  v_period date;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.tenant_id is distinct from v_uid then perform private.fail('not_found', 'Booking not found.'); end if;
  if b.status not in ('agreed', 'inspection_due', 'moved_in', 'active', 'ending') then
    perform private.fail('not_allowed', 'This booking isn''t ready to pay.');
  end if;
  if b.status in ('agreed', 'inspection_due') and b.deadline_at < now() then perform private.fail('expired', 'The time to pay has passed.'); end if;
  select * into l from public.listings where id = b.listing_id;

  -- Inspection fee: paid before the viewing, held by Bunkie, later counted toward the first payment.
  if b.status in ('moved_in', 'active', 'ending') then
    -- Monthly rent: the next unpaid month, payable from 7 days before it starts.
    v_period := private.next_rent_period(b);
    if v_period is null then perform private.fail('none', 'No rent is due.'); end if;
    if v_period > current_date + 7 then perform private.fail('early', format('Rent for this month opens on %s.', to_char(v_period - 7, 'DD Mon'))); end if;
    v_kind := 'rent';
    v_rent := b.monthly_total::bigint * 100;
    v_net := v_rent;
  elsif b.status = 'inspection_due' then
    if b.inspection_fee <= 0 then perform private.fail('not_allowed', 'This inspection is free.'); end if;
    v_kind := 'inspection';
    v_net := b.inspection_fee::bigint * 100;
  else
  v_deposit := case when b.weeks is not null then 0 else coalesce(l.deposit, 0)::bigint * 100 end;
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
    v_rent := v_net - v_deposit;
  end if;

  -- Reuse a pending payment so double taps don't create two.
  select * into v_pay from public.payments
  where booking_id = b.id and status = 'pending' and kind = v_kind and amount_kobo = v_net
    and period_start is not distinct from v_period order by created_at desc limit 1;
  if v_pay.id is not null then return v_pay; end if;

  insert into public.payments (booking_id, payer_id, kind, amount_kobo, paystack_fee_kobo, bunkie_fee_kobo, paystack_reference,
                               rent_kobo, deposit_kobo, period_start)
  values (b.id, v_uid, v_kind, v_net, public.paystack_gross_kobo(v_net) - v_net, round((v_net - v_deposit) * 0.02),
          'bk_' || replace(gen_random_uuid()::text, '-', ''),
          case when v_kind = 'inspection' then v_net else v_rent end, v_deposit, v_period)
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

  -- Monthly rent: released to the host once that month has started.
  if v_pay.kind = 'rent' then
    if b.status not in ('moved_in', 'active', 'ending') then
      perform private.refund_payment(v_pay.id, 'paid_after_close');
      return b;
    end if;
    perform private.schedule_period(b, v_pay, 'rent', v_pay.period_start,
      least((v_pay.period_start + interval '1 month')::date, b.move_out), v_pay.amount_kobo,
      greatest(now(), v_pay.period_start::timestamptz) + make_interval(hours => private.setting_int('payout_delay_hours', 24)));
    return b;
  end if;

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

-- ---------------------------------------------------------------------------
-- Caution deposit at move-out
-- ---------------------------------------------------------------------------
create or replace function private.deposit_paid(p_booking uuid) returns public.payments
language sql stable security definer set search_path = '' as $$
  select * from public.payments where booking_id = p_booking and kind = 'booking' and status = 'success'
    and deposit_kobo > 0 order by paid_at desc limit 1
$$;

-- Refund the corper what's theirs and pay the host any agreed deduction.
create or replace function private.settle_deposit(p_booking uuid, p_deduction bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  b public.bookings;
begin
  p := private.deposit_paid(p_booking);
  if p.id is null then return; end if;
  select * into b from public.bookings where id = p_booking;
  if exists (select 1 from public.deposit_settlements where booking_id = p_booking and status = 'settled') then return; end if;
  insert into public.deposit_settlements (booking_id, deposit_kobo, deduction_kobo, status, settled_at)
  values (p_booking, p.deposit_kobo, least(p_deduction, p.deposit_kobo), 'settled', now())
  on conflict (booking_id) do update set deduction_kobo = least(p_deduction, excluded.deposit_kobo), status = 'settled', settled_at = now();
  perform private.refund_part(p.id, p.deposit_kobo - least(p_deduction, p.deposit_kobo), 'deposit_return');
  perform private.schedule_period(b, p, 'deposit', null, null, least(p_deduction, p.deposit_kobo), now());
end $$;

-- Host, after move-out: keep nothing (0) or propose a deduction with a reason.
create or replace function public.propose_deposit(p_booking uuid, p_deduction int, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  p public.payments;
  v_kobo bigint := greatest(coalesce(p_deduction, 0), 0)::bigint * 100;
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.host_id is distinct from auth.uid() then perform private.fail('not_found', 'Booking not found.'); end if;
  if b.status <> 'moved_out' then perform private.fail('not_allowed', 'The deposit is settled after move-out.'); end if;
  p := private.deposit_paid(b.id);
  if p.id is null then perform private.fail('none', 'There''s no deposit on this stay.'); end if;
  if v_kobo > p.deposit_kobo then perform private.fail('too_much', 'That''s more than the deposit.'); end if;
  if exists (select 1 from public.deposit_settlements where booking_id = b.id) then perform private.fail('done', 'Already sent.'); end if;
  if v_kobo = 0 then
    perform private.settle_deposit(b.id, 0);
    return;
  end if;
  if nullif(trim(p_reason), '') is null then perform private.fail('reason', 'Say what the deduction is for.'); end if;
  insert into public.deposit_settlements (booking_id, deposit_kobo, deduction_kobo, reason)
  values (b.id, p.deposit_kobo, v_kobo, trim(p_reason));
  perform private.post_system((select id from public.conversations where booking_id = b.id),
    format('Deposit: the host proposed keeping ₦%s. Accept or dispute it on the booking.', to_char(v_kobo / 100, 'FM999,999,990')),
    jsonb_build_object('type', 'booking', 'booking_id', b.id, 'action', 'deposit_proposed'))
  where exists (select 1 from public.conversations where booking_id = b.id);
end $$;

-- Corper: accept the proposed deduction, or dispute it (the team decides).
create or replace function public.respond_deposit(p_booking uuid, p_accept boolean, p_details text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  s public.deposit_settlements;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.tenant_id is distinct from auth.uid() then perform private.fail('not_found', 'Booking not found.'); end if;
  select * into s from public.deposit_settlements where booking_id = b.id for update;
  if s.booking_id is null or s.status <> 'proposed' then perform private.fail('not_allowed', 'Nothing to answer.'); end if;
  if p_accept then
    update public.deposit_settlements set status = 'accepted', responded_at = now() where booking_id = b.id;
    perform private.settle_deposit(b.id, s.deduction_kobo);
  else
    update public.deposit_settlements set status = 'disputed', responded_at = now() where booking_id = b.id;
    insert into public.reports (reporter_id, booking_id, listing_id, kind, details)
    values (b.tenant_id, b.id, b.listing_id, 'payment',
            'Deposit dispute: host proposed keeping ₦' || to_char(s.deduction_kobo / 100, 'FM999,999,990') || ' for: ' || s.reason
            || coalesce(E'\nCorper says: ' || nullif(trim(p_details), ''), ''));
  end if;
end $$;

-- Team: decide a disputed deposit (what the host keeps), then close the report.
create or replace function public.admin_settle_deposit(p_booking uuid, p_host_keeps int, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  perform private.settle_deposit(p_booking, greatest(coalesce(p_host_keeps, 0), 0)::bigint * 100);
  update public.reports set status = 'closed', resolution = 'deposit: host keeps ₦' || p_host_keeps || coalesce(': ' || p_note, ''),
    resolved_at = now(), resolved_by = auth.uid()
  where booking_id = p_booking and kind = 'payment' and status <> 'closed';
  perform private.audit('settle_deposit', 'booking', p_booking::text, jsonb_build_object('host_keeps', p_host_keeps, 'note', p_note));
end $$;

-- End of the settle window (moved_out -> completed): settle whatever stands.
create or replace function private.settle_at_completion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.deposit_settlements;
begin
  if new.status <> 'completed' or old.status = 'completed' then return null; end if;
  select * into s from public.deposit_settlements where booking_id = new.id;
  if s.booking_id is null then
    perform private.settle_deposit(new.id, 0);                 -- host proposed nothing: full refund
  elsif s.status = 'proposed' then
    perform private.settle_deposit(new.id, s.deduction_kobo);  -- corper didn't answer: as proposed
  end if;                                                       -- disputed: the team settles it
  return null;
end $$;
create trigger settle_at_completion after update of status on public.bookings
  for each row execute function private.settle_at_completion();

do $$
declare f text;
begin
  foreach f in array array['public.propose_deposit(uuid, int, text)', 'public.respond_deposit(uuid, boolean, text)',
                           'public.admin_settle_deposit(uuid, int, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
