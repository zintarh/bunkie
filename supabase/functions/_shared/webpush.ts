// Web Push with nothing but WebCrypto: VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291).
// Keys are the usual base64url pair: VAPID_PUBLIC_KEY (65-byte point) and VAPID_PRIVATE_KEY (32-byte d).

export type Subscription = { endpoint: string; p256dh: string; auth: string };
export type PushResult = { ok: boolean; gone: boolean; status: number };

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

let signingKey: Promise<CryptoKey> | null = null;

/** VAPID Authorization header for the push service that owns `endpoint`. */
async function vapid(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const pub = unb64url(publicKey);
  signingKey ??= crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256", d: privateKey, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), ext: true,
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await signingKey, enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${publicKey}`;
}

/** Encrypts `payload` for one subscription (a single aes128gcm record). */
export async function encrypt(sub: Subscription, payload: Uint8Array) {
  const uaPublic = unb64url(sub.p256dh);
  const authSecret = unb64url(sub.auth);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, sealed);
}

/**
 * Sends one push. `topic` replaces an undelivered push with the same topic (e.g. one per chat).
 * `gone` means the phone unsubscribed: delete the subscription.
 */
export async function sendPush(sub: Subscription, data: unknown, opts: {
  publicKey: string; privateKey: string; subject: string; ttl?: number; urgency?: "normal" | "high"; topic?: string;
}): Promise<PushResult> {
  const body = await encrypt(sub, enc.encode(JSON.stringify(data)));
  const headers: Record<string, string> = {
    Authorization: await vapid(sub.endpoint, opts.publicKey, opts.privateKey, opts.subject),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(opts.ttl ?? 24 * 3600),
    Urgency: opts.urgency ?? "normal",
  };
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  const res = await fetch(sub.endpoint, { method: "POST", headers, body });
  await res.body?.cancel();
  return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status };
}
