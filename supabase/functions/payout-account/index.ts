// Host bank account for payouts.
//   { action: "banks" }                               list of Nigerian banks
//   { action: "save", bank_code, account_number }     resolve the name, check it against the profile, save
import { HttpError, admin, json, requireUser, serve } from "../_shared/clients.ts";
import { paystack } from "../_shared/paystack.ts";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);

serve(async (req) => {
  const { db, user } = await requireUser(req);
  const body = await req.json().catch(() => ({}));

  if (body.action === "banks") {
    const banks = await paystack<{ name: string; code: string; active: boolean }[]>("/bank?country=nigeria&perPage=100");
    return json({ banks: banks.filter((b) => b.active).map((b) => ({ name: b.name, code: b.code })) });
  }

  if (body.action === "save") {
    const bank = String(body.bank_code ?? "");
    const acct = String(body.account_number ?? "").replace(/\D/g, "");
    if (acct.length !== 10) throw new HttpError(400, "Account numbers have 10 digits.");

    const resolved = await paystack<{ account_name: string }>(`/bank/resolve?account_number=${acct}&bank_code=${bank}`)
      .catch(() => { throw new HttpError(400, "We couldn't find that account. Check the bank and number."); });

    // The name on the account must match the name on the profile (which the host entered from their NIN).
    const { data: p } = await db.from("profiles").select("first_name").eq("id", user.id).single();
    const { data: pp } = await db.from("profile_private").select("last_name").eq("user_id", user.id).single();
    const want = [...norm(p?.first_name ?? ""), ...norm(pp?.last_name ?? "")];
    const got = norm(resolved.account_name);
    const matches = want.length > 0 && want.every((w) => got.includes(w));
    if (!matches) throw new HttpError(400, `This account is in the name ${resolved.account_name}. Use an account in your own name.`);

    const banks = await paystack<{ name: string; code: string }[]>("/bank?country=nigeria&perPage=100");
    const recipient = await paystack<{ recipient_code: string }>("/transferrecipient", {
      method: "POST",
      body: { type: "nuban", name: resolved.account_name, account_number: acct, bank_code: bank, currency: "NGN" },
    });
    await admin.rpc("sys_save_payout_account", {
      p_host: user.id, p_bank_code: bank, p_bank_name: banks.find((b) => b.code === bank)?.name ?? bank,
      p_last4: acct.slice(-4), p_account_name: resolved.account_name, p_recipient: recipient.recipient_code, p_matches: true,
    });
    return json({ account_name: resolved.account_name });
  }

  throw new HttpError(400, "Unknown step.");
});
