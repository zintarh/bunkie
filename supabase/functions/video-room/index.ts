// Video viewings inside Bunkie (Daily). Returns a join link for the corper or host of a booked video
// viewing, from 15 minutes before until an hour after. The room is private and holds two people;
// each person gets their own short-lived meeting token, so a forwarded link doesn't let anyone else in.
// No phone numbers are involved.
import { HttpError, admin, json, requireUser, serve } from "../_shared/clients.ts";

const DAILY = "https://api.daily.co/v1";
const EARLY_MIN = 15;
const LATE_MIN = 60;

async function daily<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  const key = Deno.env.get("DAILY_API_KEY");
  if (!key) throw new HttpError(503, "Video calls aren't set up yet.");
  const res = await fetch(`${DAILY}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) as T };
}

serve(async (req) => {
  const { user } = await requireUser(req);
  const { booking_id } = await req.json().catch(() => ({}));
  if (typeof booking_id !== "string") throw new HttpError(400, "Missing booking.");

  const { data: b } = await admin.from("bookings")
    .select("id, tenant_id, host_id, status, viewing_at, viewing_mode").eq("id", booking_id).maybeSingle();
  if (!b || (user.id !== b.tenant_id && user.id !== b.host_id)) throw new HttpError(404, "Booking not found.");
  if (b.status !== "viewing_booked" || b.viewing_mode !== "video_call" || !b.viewing_at) {
    throw new HttpError(400, "There's no video viewing booked.");
  }
  const at = new Date(b.viewing_at).getTime();
  const now = Date.now();
  if (now < at - EARLY_MIN * 60_000) throw new HttpError(400, `The call opens ${EARLY_MIN} minutes before the viewing.`);
  if (now > at + LATE_MIN * 60_000) throw new HttpError(400, "This viewing's call has ended.");

  const exp = Math.floor((at + LATE_MIN * 60_000) / 1000);
  const name = `bunkie-${b.id.replace(/-/g, "").slice(0, 24)}`;
  let room = await daily<{ name?: string; url?: string }>(`/rooms/${name}`);
  if (room.status === 404) {
    room = await daily("/rooms", {
      method: "POST",
      body: {
        name, privacy: "private",
        properties: {
          exp, max_participants: 2, enable_prejoin_ui: true, enable_chat: false, enable_screenshare: false,
          enable_recording: false, eject_at_room_exp: true, lang: "en",
        },
      },
    });
  }
  if (!room.data.url) throw new HttpError(502, "Couldn't open the call. Try again.");

  const { data: me } = await admin.from("profiles").select("first_name").eq("id", user.id).maybeSingle();
  const token = await daily<{ token?: string }>("/meeting-tokens", {
    method: "POST",
    body: { properties: { room_name: name, user_name: me?.first_name || "Bunkie", exp, eject_at_token_exp: true, is_owner: user.id === b.host_id } },
  });
  if (!token.data.token) throw new HttpError(502, "Couldn't open the call. Try again.");
  return json({ url: `${room.data.url}?t=${token.data.token}` });
});
