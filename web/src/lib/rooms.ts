import "server-only";
import { DEMO_ROOMS } from "./demo";
import { estimateMinutes } from "./estimate";
import { ZONES } from "./places";
import { supabasePublic } from "./supabase/server";
import type { CorperStatus, RoomCard, RoomDetail, RoomReview, SearchParams } from "./types";

const CENTRE = { lat: 9.0579, lng: 7.4951 };

const estimate = estimateMinutes;

export async function searchRooms(p: SearchParams): Promise<RoomCard[]> {
  const db = supabasePublic();
  if (!db) return searchDemo(p);
  const { data, error } = await db.rpc("find_rooms", {
    p_mode: p.mode,
    p_move_in: p.moveIn ?? null,
    p_lat: p.lat ?? null,
    p_lng: p.lng ?? null,
    p_zone: p.zone ?? null,
    p_budget_max: p.budgetMax ?? null,
    p_pref: p.pref ?? "mixed_ok",
    p_room: p.room ?? null,
    p_stay: p.stay ?? "any",
    p_max_minutes: p.maxMinutes ?? null,
    p_limit: 40,
  });
  if (error) throw new Error(error.message);
  return data as RoomCard[];
}

/** Demo mode (no Supabase): simple filters over the bundled rooms. */
function searchDemo(p: SearchParams): RoomCard[] {
  const anchor = p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : p.zone ? ZONES.find((z) => z.id === p.zone) : undefined;
  return DEMO_ROOMS.map((r) => ({
    ...r,
    commute_min: anchor ? estimate(r.area_lat!, r.area_lng!, anchor.lat, anchor.lng) : null,
    ease_min: estimate(r.area_lat!, r.area_lng!, CENTRE.lat, CENTRE.lng),
    exact: true,
    misses: [],
  }))
    .filter((r) => r.monthly_total <= (p.budgetMax ?? Infinity))
    .filter((r) => !p.room || r.room_kind === p.room)
    .filter((r) => !p.pref || p.pref === "mixed_ok" || (p.pref === "women_only" ? r.household === "women" : r.household === "men"))
    .filter((r) => !p.stay || p.stay === "any" || (p.stay === "weeks" ? r.open_to_short : p.stay === "short" ? r.min_months <= 3 : r.max_months >= 6))
    .filter((r) => p.mode !== "camp" || (r.open_to_camp && (r.min_months <= 3 || r.open_to_short)))
    .filter((r) => !p.moveIn || !r.available_from || r.available_from <= p.moveIn)
    .filter((r) => !p.maxMinutes || r.commute_min == null || r.commute_min <= p.maxMinutes)
    .sort((a, b) =>
      p.mode === "camp" ? a.ease_min! - b.ease_min! : p.mode === "ppa" ? (a.commute_min ?? 0) - (b.commute_min ?? 0) : 0,
    );
}

export async function getRoom(id: string): Promise<RoomDetail | null> {
  const db = supabasePublic();
  if (!db) {
    const r = DEMO_ROOMS.find((x) => x.id === id);
    return r ? { ...r, ease_min: estimate(r.area_lat!, r.area_lng!, CENTRE.lat, CENTRE.lng) } : null;
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;

  const { data: l } = await db
    .from("listings")
    .select(
      `id, area_name, area_lat, area_lng, room_kind, bath_kind, furnished, household, open_to_camp, min_months, max_months,
       available_from, rent_monthly, monthly_total, total_varies, deposit, pay_schedule, photo_count, cover_path, published_at,
       early_leave_notice_days, redeploy_refund, ask_leave_notice_days, host_id,
       host:profiles!listings_host_id_fkey(first_name, photo_path, is_verified, corper_status, corper_verified),
       listing_photos(path, shot, taken_at, position),
       listing_costs(name, amount, tenant_pays, varies, position),
       house_rules(topic, choice, consequence, position)`,
    )
    .eq("id", id)
    .eq("status", "live")
    .maybeSingle();
  if (!l) return null;

  const { data: answers } = await db
    .from("bunkie_answers")
    .select("sleep, guests, cooking, cleaning, noise, approved_at")
    .eq("user_id", l.host_id)
    .maybeSingle();

  const host = (Array.isArray(l.host) ? l.host[0] : l.host) as {
    first_name: string; photo_path: string | null; is_verified: boolean; corper_status: CorperStatus | null; corper_verified: boolean;
  };
  const byPos = <T extends { position: number }>(xs: T[]) => [...xs].sort((a, b) => a.position - b.position);
  const [{ data: hold }, { data: reviews }] = await Promise.all([
    db.rpc("listing_hold", { p_listing: l.id }),
    db.rpc("listing_reviews", { p_listing: l.id, p_limit: 20 }),
  ]);
  return {
    ...(l as unknown as RoomDetail),
    host_first_name: host?.first_name ?? "",
    host_photo_path: host?.photo_path ?? null,
    host_verified: host?.is_verified ?? false,
    host_corper: host?.corper_verified ? host.corper_status : null,
    being_viewed_until: (hold as string | null) ?? null,
    reviews: (reviews ?? []) as RoomReview[],
    host_answers: answers?.approved_at ? { sleep: answers.sleep, guests: answers.guests, cooking: answers.cooking, cleaning: answers.cleaning, noise: answers.noise } : null,
    commute_min: null,
    ease_min: l.area_lat ? estimate(l.area_lat, l.area_lng!, CENTRE.lat, CENTRE.lng) : null,
    photos: byPos(l.listing_photos ?? []),
    costs: byPos(l.listing_costs ?? []),
    rules: byPos(l.house_rules ?? []),
  };
}
