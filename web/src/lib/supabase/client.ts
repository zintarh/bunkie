"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabase } from "./config";

let client: SupabaseClient | null = null;

// After an action that alerts someone, send due phone notifications now instead of waiting for the
// 5-minute cron (push-now only sends what's already queued).
const ALERTS = /\/rest\/v1\/rpc\/(send_message|request_room|booking_action|offer_room|publish_listing)$/;
let poke: ReturnType<typeof setTimeout> | null = null;
const watched: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (res.ok && (init?.method ?? "GET") === "POST" && ALERTS.test(url.split("?")[0])) {
    if (poke) clearTimeout(poke);
    poke = setTimeout(() => void client?.functions.invoke("push-now").catch(() => undefined), 600);
  }
  return res;
};

/** Browser client, or null when Supabase isn't configured. */
export function supabaseBrowser(): SupabaseClient | null {
  if (!hasSupabase) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: watched } });
  return client;
}
