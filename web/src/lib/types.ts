export type Household = "women" | "men" | "mixed";
export type SharePref = "women_only" | "men_only" | "mixed_ok";
export type NyscStage = "in_camp" | "have_ppa" | "serving";
export type RoomKind = "own_room" | "shared_room";
export type BathKind = "own" | "shared";
export type PaySchedule = "monthly" | "lump_sum";
export type PhotoShot = "bedroom" | "bathroom" | "kitchen" | "meter" | "entrance" | "extra";

export type BookingStatus =
  | "requested" | "accepted" | "viewing_booked" | "viewed" | "host_confirmed" | "agreed"
  | "paid" | "moved_in" | "active" | "ending" | "moved_out" | "completed" | "closed";

export type Answers = { sleep: number; guests: number; cooking: number; cleaning: number; noise: number };

/** One row from search_rooms(). */
export type RoomCard = {
  id: string;
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
  priceMin?: number;
  priceMax?: number;
  pref?: SharePref;
  room?: RoomKind;
  stay?: "short" | "long" | "any";
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
  months: number;
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
