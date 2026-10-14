// Thin Paystack API client. Amounts are in kobo.
const BASE = "https://api.paystack.co";

function key() {
  const k = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!k) throw new Error("PAYSTACK_SECRET_KEY is not set.");
  return k;
}

export async function paystack<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) throw new Error(`Paystack ${path}: ${json.message ?? res.status}`);
  return json.data as T;
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export async function validSignature(raw: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key()), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(raw)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
