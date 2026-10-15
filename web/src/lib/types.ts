export type Household = "women" | "men" | "mixed";
export type SharePref = "women_only" | "men_only" | "mixed_ok";
export type NyscStage = "in_camp" | "have_ppa" | "serving";
export type RoomKind = "own_room" | "shared_room" | "self_contain";
export type BathKind = "own" | "shared";
export type PaySchedule = "monthly" | "lump_sum";
export type PhotoShot = "bedroom" | "bathroom" | "kitchen" | "meter" | "entrance" | "extra";

export type BookingStatus =
  | "requested" | "accepted" | "inspection_due" | "viewing_booked" | "viewed" | "host_confirmed" | "agreed"
  | "paid" | "moved_in" | "active" | "ending" | "moved_out" | "completed" | "closed";

export type Answers = { sleep: number; guests: number; cooking: number; cleaning: number; noise: number };

/** One row from search_rooms(). */
/** Why a near-miss room isn't an exact match (from find_rooms). */
export type Miss =
  | { kind: "over_budget"; by: number }
  | { kind: "later"; days: number; on: string }
  | { kind: "farther"; minutes: number }
  | { kind: "room"; is: RoomKind }
  | { kind: "no_short" }
  | { kind: "min_stay"; months: number }
  | { kind: "max_stay"; months: number }
  | { kind: "shared_bath" }
  | { kind: "unfurnished" };

export type RoomCard = {
  id: string;
  /** Ranking from find_rooms: 0-100 score, exact match or near miss with reasons. */
  match_score?: number;
  exact?: boolean;
  misses?: Miss[];
  free_from?: string | null;
  /** 0 = free inspections. */
  inspection_fee?: number;
  /** Someone is inspecting it until then; requests wait in line. */
  being_viewed_until?: string | null;
  area_name: string;
  area_lat: number | null;
  area_lng: number | null;
  room_kind: RoomKind;
  bath_kind: BathKind | null;
  furnished: boolean | null;
  household: Household;
  open_to_camp: boolean;
  min_months: number;
  max_months: number;
  available_from: string | null;
  monthly_total: number;
  total_varies: boolean;
  deposit: number | null;
  pay_schedule: PaySchedule;
  /** Takes 1-4 week stays at weekly_price. */
  open_to_short: boolean;
  weekly_price: number | null;
  photo_count: number;
  cover_path: string | null;
  host_id: string;
  host_first_name: string;
  host_photo_path: string | null;
  host_verified: boolean;
  /** Set only when the host proved it: serving now, or served before. */
  host_corper: CorperStatus | null;
  host_answers: Answers | null;
  commute_min: number | null;
  ease_min: number | null;
  published_at: string | null;
};

export type RoomDetail = RoomCard & {
  photos: { path: string; shot: PhotoShot; taken_at: string }[];
  costs: { name: string; amount: number; tenant_pays: boolean; varies: boolean }[];
  rules: { topic: string; choice: string; consequence: string }[];
  rent_monthly: number;
  early_leave_notice_days: number;
  redeploy_refund: "all_unused" | "unused_minus_2w";
  ask_leave_notice_days: number;
};

export type SearchParams = {
  mode: "camp" | "ppa" | "any";
  moveIn?: string;
  zone?: number;
  /** Exact search point (the person's PPA), rounded so nearby searches share a cache entry. */
  lat?: number;
  lng?: number;
  /** Monthly budget, all in; undefined = no limit. */
  budgetMax?: number;
  pref?: SharePref;
  room?: RoomKind;
  stay?: "weeks" | "short" | "long" | "any";
  maxMinutes?: number;
};

export type Booking = {
  id: string;
  listing_id: string;
  tenant_id: string;
  host_id: string;
  status: BookingStatus;
  is_camp_booking: boolean;
  move_in: string;
  move_out: string;
  /** A stay is in months, or in weeks for a short stay (never both). */
  months: number | null;
  weeks: number | null;
  weekly_price: number | null;
  /** In-person inspection fee fixed when requested (0 = free); paid before the viewing is confirmed. */
  inspection_fee: number;
  inspection_payment_id: string | null;
  monthly_total: number;
  deadline_at: string | null;
  offered_slots: string[];
  viewing_mode: "in_person" | "video_call" | null;
  viewing_at: string | null;
  reschedules: number;
  tenant_matched_at: string | null;
  close_reason: string | null;
  version: number;
  created_at: string;
};

/** A host's answer to "Are you a corp member?" */
export type CorperStatus = "serving" | "served" | "not_corper";

/** A typed search, understood (by /api/understand) as filters plus an optional place. */
export type SearchIntent = {
  text: string;
  understood: {
    place?: string; budgetMax?: number; room?: RoomKind; ownBath?: boolean; furnished?: boolean;
    stay?: "weeks" | "short" | "long"; weeks?: number; months?: number; pref?: SharePref; maxMinutes?: number;
  };
  place: { label: string; lat: number; lng: number; zoneId: number } | null;
};
