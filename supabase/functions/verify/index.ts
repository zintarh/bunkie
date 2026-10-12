// Verification steps. The app calls this with { action, ... } as the signed-in user.
//   phone_confirmed  after Supabase Auth confirmed the phone (updateUser + verifyOtp 'phone_change')
//   nin              { nin, dob }            -> masked name back; records NIN + gender from the NIN record
//   nin_not_me       marks the NIN step failed so it can be redone
//   liveness         { path }                 selfie already uploaded to kyc/{user}/...
//   call_up          { path, state_code }     call-up letter already uploaded
//   address          { kind, value }          host proof of address (meter number, bill or receipt path)
import { HttpError, admin, json, requireUser, serve } from "../_shared/clients.ts";
import { identity } from "../_shared/identity.ts";

const record = (user: string, kind: string, passed: boolean, provider: string, ref: string, extra: Record<string, unknown> = {}) =>
  admin.rpc("sys_record_verification", {
    p_user: user, p_kind: kind, p_passed: passed, p_provider: provider, p_ref: ref,
    p_masked_name: extra.masked_name ?? null, p_gender: extra.gender ?? null, p_result: extra.result ?? {},
  });

serve(async (req) => {
  const { db, user } = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const ownPath = (p: unknown) => typeof p === "string" && p.startsWith(`${user.id}/`) && !p.includes("..");

  switch (body.action) {
    case "phone_confirmed": {
      if (!user.phone || !user.phone_confirmed_at) throw new HttpError(400, "Confirm the code sent to your phone first.");
      const phone = `+${user.phone.replace(/^\+/, "")}`;
      await db.from("profile_private").update({ phone }).eq("user_id", user.id);
      await record(user.id, "phone", true, "supabase_auth", user.id);
      return json({ ok: true });
    }

    case "nin": {
      const nin = String(body.nin ?? "").replace(/\D/g, "");
      const dob = String(body.dob ?? "");
      if (nin.length !== 11) throw new HttpError(400, "A NIN has 11 digits.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw new HttpError(400, "Enter your date of birth.");
      const p = identity();
      const r = await p.lookupNin(nin, dob);
      if (!r.found) throw new HttpError(404, "We couldn't find that NIN. Check the digits.");
      if (!r.dobMatches) throw new HttpError(400, "That date of birth doesn't match this NIN.");
      // Only the outcome is kept, never the NIN itself.
      await record(user.id, "nin", true, p.name, r.ref, { masked_name: r.maskedName, gender: r.gender });
      return json({ masked_name: r.maskedName });
    }

    case "nin_not_me": {
      await record(user.id, "nin", false, "user", "not_me");
      return json({ ok: true });
    }

    case "liveness": {
      if (!ownPath(body.path)) throw new HttpError(400, "Take the selfie again.");
      const p = identity();
      const r = await p.liveness(body.path, user.id);
      await record(user.id, "liveness", r.passed, p.name, r.ref, { result: { reason: r.reason ?? null } });
      if (!r.passed) throw new HttpError(400, "That didn't work. Try again in good light, face in the oval.");
      return json({ ok: true });
    }

    case "call_up": {
      const code = String(body.state_code ?? "").toUpperCase().trim();
      if (!/^[A-Z]{2}\/\d{2}[ABC]\/\d{3,5}$/.test(code)) throw new HttpError(400, "State codes look like FC/26B/1234.");
      if (!ownPath(body.path)) throw new HttpError(400, "Add your call-up letter.");
      const { count } = await admin.from("profile_private").select("user_id", { count: "exact", head: true })
        .eq("state_code", code).neq("user_id", user.id);
      if (count) throw new HttpError(409, "That state code is already on another account. Get help if it's yours.");
      await db.from("profile_private").update({ state_code: code }).eq("user_id", user.id);
      const p = identity();
      const r = await p.callUpLetter(body.path, code, user.id);
      await record(user.id, "call_up", r.passed, p.name, r.ref, { result: { reason: r.reason ?? null } });
      if (!r.passed) throw new HttpError(400, r.reason ?? "The name on the letter must match your NIN.");
      return json({ ok: true });
    }

    case "address": {
      const kind = String(body.kind ?? "");
      if (!["meter", "bill", "receipt"].includes(kind)) throw new HttpError(400, "Pick a proof of address.");
      const value = String(body.value ?? "");
      if (kind === "meter" ? !/^\d{11,13}$/.test(value) : !ownPath(value)) throw new HttpError(400, "Check the proof of address.");
      const p = identity();
      const r = await p.proofOfAddress(kind, value, user.id);
      await record(user.id, "proof_of_address", r.passed, p.name, r.ref, { result: { kind } });
      if (!r.passed) throw new HttpError(400, r.reason ?? "We couldn't confirm that address.");
      return json({ ok: true });
    }

    default:
      throw new HttpError(400, "Unknown step.");
  }
});
