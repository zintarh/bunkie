// Paystack webhook. The only thing that can mark a booking paid.
// Deploy with --no-verify-jwt: Paystack doesn't send a Supabase token; the HMAC signature is the check.
import { admin } from "../_shared/clients.ts";
import { paystack, validSignature } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-paystack-signature")))) {
    return new Response("bad signature", { status: 401 });
  }
  const event = JSON.parse(raw) as { event: string; data: Record<string, any> };
  const d = event.data;

  try {
    switch (event.event) {
      case "charge.success": {
        // Never trust the webhook body alone: confirm with Paystack.
        const v = await paystack<{ status: string; amount: number; currency: string }>(`/transaction/verify/${encodeURIComponent(d.reference)}`);
        if (v.status !== "success" || v.currency !== "NGN") break;
        const { error } = await admin.rpc("sys_mark_paid", { p_reference: d.reference, p_amount_kobo: v.amount, p_raw: d });
        if (error) throw error;
        break;
      }
      case "charge.failed": {
        await admin.rpc("sys_mark_payment_failed", { p_reference: d.reference, p_raw: d });
        break;
      }
      case "transfer.success":
      case "transfer.failed":
      case "transfer.reversed": {
        // Transfer reference is the payout id.
        const status = event.event === "transfer.success" ? "done" : "failed";
        await admin.rpc("sys_set_money_status", {
          p_table: "payouts", p_id: d.reference, p_status: status, p_ref: d.transfer_code ?? null,
          p_error: status === "failed" ? d.reason ?? event.event : null,
        });
        break;
      }
      case "refund.processed":
      case "refund.failed": {
        const { data: r } = await admin.from("refunds").select("id").eq("provider_ref", String(d.id ?? d.refund_reference ?? "")).maybeSingle();
        if (r) {
          await admin.rpc("sys_set_money_status", {
            p_table: "refunds", p_id: r.id, p_status: event.event === "refund.processed" ? "done" : "failed",
            p_ref: null, p_error: event.event === "refund.failed" ? "Paystack refund failed" : null,
          });
        }
        break;
      }
    }
  } catch (e) {
    console.error(event.event, e);
    // Non-200 makes Paystack retry later.
    return new Response("retry", { status: 500 });
  }
  return new Response("ok");
});
