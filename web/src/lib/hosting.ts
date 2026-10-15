/** Listing steps in order (the editor in app/host/listing/[id] uses this list). */
export const HOST_STEPS = ["location", "photos", "room", "costs", "rules", "refunds"] as const;
export type HostStep = (typeof HOST_STEPS)[number];

export const STEP_LABEL: Record<HostStep, string> = {
  location: "Location", photos: "Photos", room: "Room and stay", costs: "Costs", rules: "House rules", refunds: "Refunds",
};

/** Photos every listing needs before it can go live (mirrors listing_missing() in the database). */
export const REQUIRED_SHOTS = ["bedroom", "bathroom", "kitchen", "meter", "entrance"] as const;

/** The listing fields needed to tell which steps are filled in. Select these with LISTING_PROGRESS. */
export type ProgressFields = {
  id: string;
  room_kind: string | null; household: string | null; available_from: string | null;
  rent_monthly: number | null; allowed_to_share: boolean; open_to_short: boolean; weekly_price: number | null;
  listing_locations: unknown | null;
  listing_photos: { shot: string }[];
  house_rules: unknown[];
};
export const LISTING_PROGRESS =
  "id, room_kind, household, available_from, rent_monthly, allowed_to_share, open_to_short, weekly_price, listing_locations(listing_id), listing_photos(shot), house_rules(id)";

/** Which steps are filled in. Steps can be done in any order; the listing goes live only when all are. */
export function stepsDone(l: ProgressFields): Set<HostStep> {
  const loc = Array.isArray(l.listing_locations) ? l.listing_locations.length > 0 : !!l.listing_locations;
  const done = new Set<HostStep>();
  if (loc) done.add("location");
  if (REQUIRED_SHOTS.every((s) => l.listing_photos?.some((p) => p.shot === s))) done.add("photos");
  if (l.room_kind && l.household && l.available_from && (!l.open_to_short || (l.weekly_price ?? 0) > 0)) done.add("room");
  if ((l.rent_monthly ?? 0) > 0) done.add("costs");
  if ((l.house_rules?.length ?? 0) > 0) done.add("rules");
  if (l.allowed_to_share) done.add("refunds");
  return done;
}

/** Where to reopen a draft: the first step not filled in, or the review once all are. */
export function resumeHref(l: ProgressFields) {
  const done = stepsDone(l);
  return `/host/listing/${l.id}?step=${HOST_STEPS.find((s) => !done.has(s)) ?? "review"}`;
}

export const draftProgress = (l: ProgressFields) => stepsDone(l).size / HOST_STEPS.length;

export function draftLabel(l: ProgressFields) {
  const n = stepsDone(l).size;
  return n >= HOST_STEPS.length ? "Ready to publish" : `${n} of ${HOST_STEPS.length} steps done`;
}
