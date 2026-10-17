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
    /** Monthly budget, all in; null = any. */
    budget: number | null;
    /** Exact stay length; null = any. */
    length: StayLength | null;
    room: RoomKind | null;
    maxMinutes: number | null;
    moveIn: string | null;
  };
  saved: string[];
};

export type StayLength = { unit: "weeks" | "months"; n: number };

export const DEFAULT_FILTERS: Prefs["filters"] = {
  budget: null, length: null, room: null, maxMinutes: null, moveIn: null,
};

/** Saved filters from before exact budgets and lengths: priceMax 150000 meant "any". */
function migrateFilters(raw: Record<string, unknown> | undefined): Prefs["filters"] {
  const f = { ...DEFAULT_FILTERS, ...(raw ?? {}) } as Prefs["filters"] & { priceMax?: number; priceMin?: number; stay?: string };
  if (raw && !("budget" in raw)) f.budget = typeof f.priceMax === "number" && f.priceMax < 150000 ? f.priceMax : null;
  if (raw && !("length" in raw)) f.length = null;
  delete f.priceMax;
  delete f.priceMin;
  delete f.stay;
  return f;
}

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
    if (raw) {
      const saved = JSON.parse(raw);
      current = { ...DEFAULTS, ...saved, filters: migrateFilters(saved.filters) };
    }
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
