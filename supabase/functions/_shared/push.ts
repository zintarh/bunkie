// Phone notifications: turns a 'push' job into a notification on each of the person's phones.
import { admin } from "./clients.ts";
import { sendPush } from "./webpush.ts";

export type Job = { id: number; payload: Record<string, any>; attempts: number };

// What each alert says. `o` is the other person's first name. Links open the right screen.
const COPY: Record<string, (o: string) => { title: string; body: string }> = {
  request_new: (o) => ({ title: "New request", body: `${o} wants to bunk with you.` }),
  requests_waiting: () => ({ title: "Requests waiting", body: "Corpers are waiting to hear about your room." }),
  request_accepted: (o) => ({ title: `${o} accepted`, body: "Pick a viewing time." }),
  booking_closed: () => ({ title: "A booking closed", body: "See why, and rooms like it." }),
  viewing_booked: (o) => ({ title: "Viewing booked", body: `You're seeing ${o}'s room.` }),
  viewing_reminder: (o) => ({ title: "Viewing in 2 hours", body: `With ${o}.` }),
  viewing_rescheduled: (o) => ({ title: "Viewing moved", body: `${o} moved it. Pick a new time.` }),
  tenant_matched: (o) => ({ title: "Room matched", body: `${o} confirmed. Confirm the agreement.` }),
  agreement_ready: (o) => ({ title: "Your turn", body: `${o} confirmed the agreement.` }),
  pay_now: () => ({ title: "Pay to lock the room", body: "Tap to pay." }),
  pay_inspection: () => ({ title: "Pay the inspection fee", body: "Tap to pay." }),
  booked: (o) => ({ title: "You're bunkies", body: `You and ${o} are all set.` }),
  arrival_planned: (o) => ({ title: "Arrival time set", body: `${o} picked when they'll arrive.` }),
  move_in_day: (o) => ({ title: "Move-in day", body: `Check in when you get to ${o}'s.` }),
  confirm_move_in: (o) => ({ title: `${o} checked in`, body: "Confirm they moved in." }),
  stay_ending: (o) => ({ title: "Notice given", body: `${o} gave notice. See the last night.` }),
  want_offer: (o) => ({ title: "Room offered", body: `${o} offered you a room.` }),
  new_message: (o) => ({ title: o, body: "Sent you a message" }),
};

// Sent even in quiet hours.
const URGENT = new Set(["pay_now", "pay_inspection", "booked"]);

/** 7am Lagos (UTC+1) if it's between 10pm and 7am there now, else null. */
export function quietUntil(now = new Date()): Date | null {
  const h = (now.getUTCHours() + 1) % 24;
  if (h >= 7 && h < 22) return null;
  const t = new Date(now);
  if (h >= 22) t.setUTCDate(t.getUTCDate() + 1);
  t.setUTCHours(6, 0, 0, 0);
  return t;
}

/** Handles one job. Returns "deferred" when held for quiet hours (the caller must not finish it). */
export async function pushJob(job: Job): Promise<"sent" | "skipped" | "deferred"> {
  const { user_id, template, conversation_id, booking_id, message_id } = job.payload;
  const copy = COPY[template];
  if (!copy) return "skipped";

  const later = URGENT.has(template) ? null : quietUntil();
  if (later) {
    await admin.rpc("sys_defer_job", { p_id: job.id, p_until: later.toISOString() });
    return "deferred";
  }

  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", user_id);
  if (!subs?.length) return "skipped";
  const { data: rows, error } = await admin.rpc("sys_push_job", { p_payload: job.payload });
  if (error) throw error;
  const info = rows?.[0];
  if (!info) return "skipped";                               // read already, muted, or gone

  let { title, body } = copy(info.other_name || "Your bunkie");
  if (template === "new_message" && message_id) {
    const { data: m } = await admin.from("messages").select("kind, body").eq("id", message_id).maybeSingle();
    if (m?.kind === "image") body = "Sent a photo";
    else if (m?.body) body = m.body.length > 120 ? `${m.body.slice(0, 117)}…` : m.body;
  }
  const url = conversation_id ? `/inbox/${conversation_id}` : booking_id ? `/bookings/${booking_id}` : template === "requests_waiting" ? "/host" : "/explore";
  const tag = conversation_id ? `chat-${conversation_id}` : booking_id ? `booking-${booking_id}` : template;

  const keys = { publicKey: Deno.env.get("VAPID_PUBLIC_KEY")!, privateKey: Deno.env.get("VAPID_PRIVATE_KEY")!, subject: Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@bunkie.ng" };
  if (!keys.publicKey || !keys.privateKey) throw new Error("VAPID keys not set");

  const sent: string[] = [];
  const gone: string[] = [];
  let failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      const r = await sendPush(s, { title, body, url, tag }, {
        ...keys, urgency: template === "new_message" || URGENT.has(template) ? "high" : "normal", topic: tag.replace(/-/g, ""),
        ttl: template === "viewing_reminder" ? 2 * 3600 : 24 * 3600,
      });
      if (r.ok) sent.push(s.endpoint);
      else if (r.gone) gone.push(s.endpoint);
      else failed++;
    } catch (e) {
      console.error("push", e);
      failed++;
    }
  }));
  await admin.rpc("sys_push_sent", { p_endpoints: sent, p_gone: gone });
  if (!sent.length && failed) throw new Error(`push failed on ${failed} device(s)`);
  return "sent";
}

/** Sends due push jobs until `ms` runs out. */
export async function drainPush(limit: number, ms: number) {
  const started = Date.now();
  const { data: jobs } = await admin.rpc("sys_claim_jobs", { p_queue: "push", p_limit: limit });
  let sent = 0;
  for (const job of (jobs ?? []) as Job[]) {
    if (Date.now() - started > ms) {
      await admin.rpc("sys_defer_job", { p_id: job.id, p_until: new Date().toISOString() });
      continue;
    }
    try {
      const r = await pushJob(job);
      if (r !== "deferred") await admin.rpc("sys_finish_job", { p_id: job.id, p_error: null });
      if (r === "sent") sent++;
    } catch (e) {
      console.error("push", job.id, e);
      await admin.rpc("sys_finish_job", { p_id: job.id, p_error: String((e as Error).message ?? e).slice(0, 500) });
    }
  }
  return sent;
}
