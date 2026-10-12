"use client";
import { supabaseBrowser } from "./supabase/client";

/** Calls a Supabase Edge Function as the signed-in user and returns its JSON, throwing its error sentence. */
export async function callFunction<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const db = supabaseBrowser();
  if (!db) throw new Error("Connect Supabase first.");
  const { data, error } = await db.functions.invoke(name, { body });
  if (error) {
    let msg = "Something went wrong. Try again.";
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
    } catch {
      // Body wasn't JSON.
    }
    throw new Error(msg);
  }
  return data as T;
}
