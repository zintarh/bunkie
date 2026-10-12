"use client";
import { useSyncExternalStore } from "react";
import type { NyscStage, RoomKind, SharePref } from "./types";

/** What a visitor told us before having an account. Kept on the phone; copied to the profile at sign-up. */
export type Prefs = {
  introSeen: boolean;
  stage: NyscStage | null;
  pref: SharePref | null;
  batchId: string | null;
  ppa: { label: string; lat: number; lng: number; zoneId: number } | null;
  filters: {
    priceMin: number;
    priceMax: number;
    stay: "short" | "long" | "any";
    room: RoomKind | null;
    maxMinutes: number | null;
    moveIn: string | null;
  };
  saved: string[];
};

export const DEFAULT_FILTERS: Prefs["filters"] = {
  priceMin: 20000, priceMax: 150000, stay: "any", room: null, maxMinutes: null, moveIn: null,
};

const DEFAULTS: Prefs = { introSeen: false, stage: null, pref: null, batchId: null, ppa: null, filters: DEFAULT_FILTERS, saved: [] };
const KEY = "bunkie.prefs.v1";

let current: Prefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) current = { ...DEFAULTS, ...JSON.parse(raw), filters: { ...DEFAULT_FILTERS, ...JSON.parse(raw).filters } };
  } catch {
    // Private mode or blocked storage: keep defaults for this visit.
  }
}

export function getPrefs(): Prefs {
  load();
  return current;
}

export function setPrefs(patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) {
  load();
  const next = typeof patch === "function" ? patch(current) : patch;
  current = { ...current, ...next };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable: the change still applies until the tab closes.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      loaded = false;
      load();
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Prefs plus a flag that turns true once the phone's saved values have loaded. */
export function usePrefs(): [Prefs, boolean] {
  const p = useSyncExternalStore(subscribe, getPrefs, () => DEFAULTS);
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  return [p, ready];
}
