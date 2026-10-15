-- New booking step for paid inspections: the corper picked a time and the fee is due.
-- (Its own migration: a new enum value can't be used in the transaction that adds it.)
alter type public.booking_status add value if not exists 'inspection_due' after 'accepted';
