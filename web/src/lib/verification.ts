/**
 * The checks someone sends to be verified (supabase sys_record_verification counts the same ones).
 * Their phone number is asked for too, but isn't a check until an SMS provider is connected.
 * Corpers with a PPA (have one, or already serving) also send their PPA acceptance letter.
 */
export function neededChecks(isHost: boolean, hasPpa: boolean): string[] {
  if (isHost) return ["nin", "proof_of_address"];
  return hasPpa ? ["nin", "call_up", "ppa_letter"] : ["nin", "call_up"];
}

/** Kinds already sent: passed, or waiting to be looked at. */
export const sentKinds = (rows: { kind: string; status: string }[] | null) =>
  new Set((rows ?? []).filter((v) => v.status === "passed" || v.status === "pending").map((v) => v.kind));
