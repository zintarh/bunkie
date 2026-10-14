"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "./supabase/client";
import type { CorperStatus } from "./types";

export type Me = {
  user: User;
  profile: {
    first_name: string; photo_path: string | null; is_verified: boolean; is_host: boolean; standing: number;
    corper_status: CorperStatus | null; corper_verified: boolean;
  };
};

let cached: Me | null | undefined;
const listeners = new Set<(m: Me | null) => void>();

async function loadMe(): Promise<Me | null> {
  const db = supabaseBrowser();
  if (!db) return null;
  const { data } = await db.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await db.from("profiles").select("first_name, photo_path, is_verified, is_host, standing, corper_status, corper_verified").eq("id", data.user.id).single();
  return { user: data.user, profile: profile ?? { first_name: "", photo_path: null, is_verified: false, is_host: false, standing: 100, corper_status: null, corper_verified: false } };
}

export async function refreshMe() {
  cached = await loadMe();
  listeners.forEach((l) => l(cached ?? null));
  return cached;
}

let subscribed = false;
function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  supabaseBrowser()?.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void refreshMe();
  });
}

/** [me, loading]. me is null when signed out or when Supabase isn't connected. */
export function useMe(): [Me | null, boolean] {
  const [me, setMe] = useState<Me | null | undefined>(cached);
  useEffect(() => {
    ensureSubscribed();
    listeners.add(setMe);
    if (cached === undefined) void refreshMe();
    return () => {
      listeners.delete(setMe);
    };
  }, []);
  return [me ?? null, me === undefined];
}

/** Turns a Postgres function error into the plain sentence the database wrote for people. */
export function errorText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    const m = (e as { message: string }).message;
    if (/fetch|network/i.test(m)) return "No connection. Check your data and try again.";
    return m;
  }
  return "Something went wrong. Try again.";
}
