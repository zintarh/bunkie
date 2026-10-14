-- How far the host got in the listing steps (0 = none done, 6 = all done, ready to review),
-- so the app can show progress and reopen the right step.
alter table public.listings
  add column draft_step smallint not null default 0 check (draft_step between 0 and 6);

grant update (draft_step) on public.listings to authenticated;
