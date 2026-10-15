// Starts a Paystack checkout for a booking the tenant has agreed to.
// The amount comes from start_payment() in the database, never from the app.
import { HttpError, json, requireUser, serve } from "../_shared/clients.ts";
import { paystack } from "../_shared/paystack.ts";

serve(async (req) => {
  const { db, user } = await requireUser(req);
  const { booking_id } = await req.json().catch(() => ({}));
  if (typeof booking_id !== "string") throw new HttpError(400, "Missing booking.");

  const { data: pay, error } = await db.rpc("start_payment", { p_booking: booking_id });
  if (error) throw new HttpError(400, error.message);

  const site = Deno.env.get("SITE_URL") ?? "http://localhost:3000";
  const init = await paystack<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: {
      email: user.email,
      amount: Number(pay.amount_kobo) + Number(pay.paystack_fee_kobo),
      reference: pay.paystack_reference,
      currency: "NGN",
      callback_url: `${site}/bookings/${booking_id}`,
      metadata: { booking_id, payment_id: pay.id, cancel_action: `${site}/bookings/${booking_id}` },
    },
  }).catch((e) => {
    // A reference Paystack has already seen: reuse its checkout.
    if (String(e.message).includes("Duplicate")) return null;
    // Paystack's own reason (e.g. "Invalid Email Address Passed") is clearer than a generic error.
    throw new HttpError(400, String(e.message).replace(/^Paystack \/[^:]+: /, ""));
  });

  if (!init) {
    const v = await paystack<{ authorization_url?: string }>(`/transaction/verify/${pay.paystack_reference}`).catch(() => null);
    if (v?.authorization_url) return json({ authorization_url: v.authorization_url, reference: pay.paystack_reference });
    throw new HttpError(409, "This payment is already in progress. Check your bank app, then refresh.");
  }
  return json({ authorization_url: init.authorization_url, reference: init.reference });
});
