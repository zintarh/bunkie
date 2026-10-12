"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabase } from "./config";

let client: SupabaseClient | null = null;

/** Browser client, or null when Supabase isn't configured. */
export function supabaseBrowser(): SupabaseClient | null {
  if (!hasSupabase) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
