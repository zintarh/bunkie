// Drains the job queue. Called by pg_cron every 10 seconds with the service key.
// Each queue is claimed in a batch; failures go back with growing waits and die after 5 tries.
import { admin, json } from "../_shared/clients.ts";
import { paystack } from "../_shared/paystack.ts";

type Job = { id: number; payload: Record<string, any>; attempts: number };
const SITE = Deno.env.get("SITE_URL") ?? "http://localhost:3000";

Deno.serve(async (req) => {
  // Only pg_cron (service key) may run the worker.
  if (req.headers.get("Authorization") !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("forbidden", { status: 403 });
  }
  const started = Date.now();
  const done: Record<string, number> = {};
  for (const [queue, handler, batch] of [
    ["payout", payout, 20], ["refund", refund, 20], ["whatsapp", whatsapp, 50], ["commute", commute, 5],
  ] as const) {
    const { data: jobs } = await admin.rpc("sys_claim_jobs", { p_queue: queue, p_limit: batch });
    for (const job of (jobs ?? []) as Job[]) {
      if (Date.now() - started > 20000) break;   // leave room before the 25s timeout
      try {
        await handler(job);
        await admin.rpc("sys_finish_job", { p_id: job.id, p_error: null });
        done[queue] = (done[queue] ?? 0) + 1;
      } catch (e) {
        console.error(queue, job.id, e);
        await admin.rpc("sys_finish_job", { p_id: job.id, p_error: String((e as Error).message ?? e).slice(0, 500) });
      }
    }
  }
  return json({ done });
});

// ---------------------------------------------------------------------------
// Payouts: release the host's share once the delay has passed and nothing is reported.
// ---------------------------------------------------------------------------
async function payout(job: Job) {
  // One payout = one period's share (or an inspection fee, or a kept deposit). Older jobs carry only payment_id.
  const ids: string[] = job.payload.payout_id
    ? [job.payload.payout_id]
    : ((await admin.from("payouts").select("id").eq("payment_id", job.payload.payment_id).eq("status", "scheduled")).data ?? []).map((r) => r.id);
  for (const id of ids) {
    const { data } = await admin.rpc("sys_payout_due", { p_payout: id });
    const p = data?.[0];
    if (!p) continue;                                     // cancelled, already sent, or a problem is open
    if (new Date(p.release_after) > new Date()) throw new Error("not yet");
    // Rent waits for a confirmed move-in; inspection fees and agreed deposit deductions don't.
    if (p.kind === "rent" && !["moved_in", "active", "ending", "moved_out", "completed"].includes(p.booking_status)) continue;
    if (!p.recipient_code) throw new Error("host has no payout account");
    await admin.rpc("sys_set_money_status", { p_table: "payouts", p_id: p.payout_id, p_status: "processing", p_ref: null, p_error: null });
    const t = await paystack<{ transfer_code: string }>("/transfer", {
      method: "POST",
      body: { source: "balance", amount: p.amount_kobo, recipient: p.recipient_code, reference: p.payout_id, reason: "Bunkie payout" },
    });
    // transfer.success / transfer.failed webhooks finish it.
    await admin.rpc("sys_set_money_status", { p_table: "payouts", p_id: p.payout_id, p_status: "processing", p_ref: t.transfer_code, p_error: null });
  }
}

async function refund(job: Job) {
  const { data: rows } = await admin.from("refunds").select("id, amount_kobo, status").eq("payment_id", job.payload.payment_id).eq("status", "scheduled");
  for (const r of rows ?? []) {
    await admin.rpc("sys_set_money_status", { p_table: "refunds", p_id: r.id, p_status: "processing", p_ref: null, p_error: null });
    const res = await paystack<{ id: number }>("/refund", { method: "POST", body: { transaction: job.payload.reference, amount: r.amount_kobo } });
    await admin.rpc("sys_set_money_status", { p_table: "refunds", p_id: r.id, p_status: "processing", p_ref: String(res.id), p_error: null });
  }
}

// ---------------------------------------------------------------------------
// WhatsApp: approved templates only. Each template takes the other person's name and a link.
// ---------------------------------------------------------------------------
const TEMPLATES: Record<string, { name: string; text: (o: string) => string }> = {
  request_new: { name: "bunkie_request_new", text: (o) => `${o} wants to bunk with you. Reply in the app.` },
  requests_waiting: { name: "bunkie_requests_waiting", text: () => "You have requests waiting for your room." },
  request_accepted: { name: "bunkie_request_accepted", text: (o) => `${o} accepted. Pick a viewing time.` },
  booking_closed: { name: "bunkie_booking_closed", text: () => "A booking closed. See why and find similar rooms." },
  viewing_booked: { name: "bunkie_viewing_booked", text: (o) => `Viewing with ${o} is booked.` },
  viewing_reminder: { name: "bunkie_viewing_reminder", text: (o) => `Your viewing with ${o} is in 2 hours.` },
  viewing_rescheduled: { name: "bunkie_viewing_rescheduled", text: (o) => `${o} moved the viewing. Pick a new time.` },
  tenant_matched: { name: "bunkie_tenant_matched", text: (o) => `${o} confirmed the room matched. Confirm the agreement.` },
  agreement_ready: { name: "bunkie_agreement_ready", text: (o) => `${o} confirmed the agreement. Your turn.` },
  pay_now: { name: "bunkie_pay_now", text: () => "Pay to lock the room." },
  pay_inspection: { name: "bunkie_pay_inspection", text: () => "Pay the inspection fee to confirm your inspection." },
  booked: { name: "bunkie_booked", text: (o) => `You and ${o} are bunkies.` },
  arrival_planned: { name: "bunkie_arrival_planned", text: (o) => `${o} picked an arrival time.` },
  move_in_day: { name: "bunkie_move_in_day", text: (o) => `Move-in day with ${o}. Check in when you arrive.` },
  confirm_move_in: { name: "bunkie_confirm_move_in", text: (o) => `${o} checked in. Confirm they moved in.` },
  stay_ending: { name: "bunkie_stay_ending", text: (o) => `${o} gave notice. See the last night.` },
  // Never includes the message text: just who, and a link into the chat.
  new_message: { name: "bunkie_new_message", text: (o) => `${o} sent you a message on Bunkie.` },
};

async function whatsapp(job: Job) {
  const { user_id, template, booking_id, conversation_id, message_id } = job.payload;
  const t = TEMPLATES[template];
  if (!t) return;
  // Chat nudges: only if still unread, not muted, and none sent for this chat in the last 30 minutes.
  if (template === "new_message") {
    const { data: due } = await admin.rpc("sys_chat_should_notify", { p_conversation: conversation_id, p_user: user_id, p_message: message_id });
    if (!due) return;
  }
  const { data: who } = await admin.from("profile_private").select("phone, phone_verified, whatsapp_opt_in").eq("user_id", user_id).maybeSingle();
  if (!who?.phone || !who.phone_verified || !who.whatsapp_opt_in) return;

  let other = "Your bunkie";
  if (conversation_id) {
    const { data: c } = await admin.from("conversations").select("tenant_id, host_id").eq("id", conversation_id).maybeSingle();
    const otherId = c ? (c.tenant_id === user_id ? c.host_id : c.tenant_id) : null;
    if (otherId) other = (await admin.from("profiles").select("first_name").eq("id", otherId).single()).data?.first_name || other;
  } else if (booking_id) {
    const { data: b } = await admin.from("bookings").select("tenant_id, host_id").eq("id", booking_id).maybeSingle();
    const otherId = b ? (b.tenant_id === user_id ? b.host_id : b.tenant_id) : null;
    if (otherId) other = (await admin.from("profiles").select("first_name").eq("id", otherId).single()).data?.first_name || other;
  }
  const link = conversation_id ? `${SITE}/inbox/${conversation_id}` : booking_id ? `${SITE}/bookings/${booking_id}` : `${SITE}/host`;

  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) {
    console.log(`[whatsapp:dry-run] to ${who.phone}: ${t.text(other)} ${link}`);
    return;
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: who.phone.replace("+", ""),
      type: "template",
      template: {
        name: t.name,
        language: { code: "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: other }, { type: "text", text: link }] }],
      },
    }),
  });
  if (res.status === 429) throw new Error("whatsapp rate limited");
  if (!res.ok) throw new Error(`whatsapp ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// ---------------------------------------------------------------------------
// Commute: morning-rush minutes from the listing to every PPA zone, once per publish.
// ---------------------------------------------------------------------------
async function commute(job: Job) {
  const { listing_id } = job.payload;
  const { data: loc } = await admin.from("listing_locations").select("lat, lng").eq("listing_id", listing_id).maybeSingle();
  if (!loc) return;
  const { data: zones } = await admin.from("ppa_zones").select("id, lat, lng").order("id");
  if (!zones?.length) return;

  const key = Deno.env.get("GOOGLE_MAPS_KEY");
  let rows: { zone_id: number; minutes: number }[];
  if (!key) {
    rows = zones.map((z) => ({ zone_id: z.id, minutes: estimate(loc.lat, loc.lng, z.lat, z.lng) }));
  } else {
    const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "destinationIndex,duration,condition" },
      body: JSON.stringify({
        origins: [{ waypoint: { location: { latLng: { latitude: loc.lat, longitude: loc.lng } } } }],
        destinations: zones.map((z) => ({ waypoint: { location: { latLng: { latitude: z.lat, longitude: z.lng } } } })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        departureTime: nextWeekdayMorning().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`routes ${res.status}`);
    const out = (await res.json()) as { destinationIndex: number; duration?: string; condition?: string }[];
    rows = out.map((r) => ({
      zone_id: zones[r.destinationIndex].id,
      minutes: r.condition === "ROUTE_EXISTS" && r.duration ? Math.round(parseInt(r.duration, 10) / 60)
        : estimate(loc.lat, loc.lng, zones[r.destinationIndex].lat, zones[r.destinationIndex].lng),
    }));
  }
  const { error } = await admin.rpc("sys_store_commute", { p_listing: listing_id, p_rows: rows });
  if (error) throw error;
}

function estimate(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return Math.round(((2 * 6371000 * Math.asin(Math.sqrt(h))) / 1000) * 2.6 + 6);
}

/** 7:30am Lagos time on the next weekday. */
function nextWeekdayMorning() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(6, 30, 0, 0);   // Lagos is UTC+1
  return d;
}
