import type { RoomDetail } from "./types";

/**
 * Sample rooms shown when Supabase isn't connected, so the app can be clicked through
 * before the backend exists. Never mixed with real listings.
 */
const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));

const base = {
  furnished: true,
  open_to_camp: true,
  deposit: 20000,
  pay_schedule: "monthly" as const,
  host_photo_path: null,
  host_verified: true,
  commute_min: null,
  ease_min: null,
  photo_count: 5,
  early_leave_notice_days: 14,
  redeploy_refund: "all_unused" as const,
  ask_leave_notice_days: 7,
  rules: [
    { topic: "Guests", choice: "Day visitors only", consequence: "warning_then_notice" },
    { topic: "Smoking", choice: "Not allowed", consequence: "notice" },
    { topic: "Noise", choice: "Quiet after 10pm", consequence: "warning" },
  ],
};

const photos = (n: number) =>
  (["bedroom", "bathroom", "kitchen", "meter", "entrance"] as const).map((shot, i) => ({
    path: `/demo/room-${((n + i) % 4) + 1}.svg`, shot, taken_at: iso(today),
  }));

export const DEMO_ROOMS: RoomDetail[] = [
  {
    ...base, id: "demo-wuse2", area_name: "Wuse 2", area_lat: 9.079, area_lng: 7.47, room_kind: "own_room", bath_kind: "shared",
    household: "women", min_months: 1, max_months: 6, available_from: inDays(0), rent_monthly: 45000, monthly_total: 53000,
    total_varies: true, cover_path: "/demo/room-1.svg", host_id: "demo-tolu", host_first_name: "Tolu",
    host_answers: { sleep: 1, guests: 1, cooking: 2, cleaning: 0, noise: 1 }, published_at: inDays(-3), photos: photos(0),
    costs: [
      { name: "Light", amount: 6000, tenant_pays: true, varies: true },
      { name: "Wi-Fi", amount: 2000, tenant_pays: true, varies: false },
      { name: "Water", amount: 0, tenant_pays: false, varies: false },
    ],
  },
  {
    ...base, id: "demo-garki", area_name: "Garki II", area_lat: 9.03, area_lng: 7.489, room_kind: "own_room", bath_kind: "own",
    household: "mixed", min_months: 3, max_months: 12, available_from: inDays(5), rent_monthly: 60000, monthly_total: 71000,
    total_varies: false, cover_path: "/demo/room-2.svg", host_id: "demo-emeka", host_first_name: "Emeka",
    host_answers: { sleep: 2, guests: 0, cooking: 1, cleaning: 1, noise: 0 }, published_at: inDays(-6), photos: photos(1),
    costs: [
      { name: "Service charge", amount: 7000, tenant_pays: true, varies: false },
      { name: "Light", amount: 4000, tenant_pays: true, varies: false },
    ],
  },
  {
    ...base, id: "demo-gwarinpa", area_name: "Gwarinpa", area_lat: 9.11, area_lng: 7.4, room_kind: "shared_room", bath_kind: "shared",
    household: "women", min_months: 1, max_months: 3, available_from: inDays(0), rent_monthly: 32000, monthly_total: 39000,
    total_varies: true, cover_path: "/demo/room-3.svg", host_id: "demo-amaka", host_first_name: "Amaka", deposit: null,
    host_answers: { sleep: 0, guests: 0, cooking: 2, cleaning: 0, noise: 0 }, published_at: inDays(-1), photos: photos(2),
    costs: [
      { name: "Light", amount: 5000, tenant_pays: true, varies: true },
      { name: "Generator fuel", amount: 2000, tenant_pays: true, varies: true },
    ],
  },
  {
    ...base, id: "demo-utako", area_name: "Utako", area_lat: 9.07, area_lng: 7.44, room_kind: "own_room", bath_kind: "shared",
    household: "men", min_months: 1, max_months: 12, available_from: inDays(2), rent_monthly: 50000, monthly_total: 58000,
    total_varies: false, cover_path: "/demo/room-4.svg", host_id: "demo-musa", host_first_name: "Musa", open_to_camp: false,
    host_answers: { sleep: 1, guests: 2, cooking: 3, cleaning: 1, noise: 1 }, published_at: inDays(-10), photos: photos(3),
    costs: [{ name: "Light", amount: 8000, tenant_pays: true, varies: false }],
  },
  {
    ...base, id: "demo-lugbe", area_name: "Lugbe", area_lat: 8.98, area_lng: 7.38, room_kind: "own_room", bath_kind: "own",
    household: "mixed", min_months: 1, max_months: 6, available_from: inDays(0), rent_monthly: 30000, monthly_total: 36000,
    total_varies: true, cover_path: "/demo/room-2.svg", host_id: "demo-bisi", host_first_name: "Bisi",
    host_answers: { sleep: 1, guests: 1, cooking: 1, cleaning: 0, noise: 1 }, published_at: inDays(-2), photos: photos(1),
    costs: [{ name: "Light", amount: 6000, tenant_pays: true, varies: true }],
  },
];
