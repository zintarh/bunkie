import "server-only";
import { NextResponse } from "next/server";

/** Server-side Google Maps key (Places API (New) + Geocoding API). Never sent to the browser. */
export const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY ?? "";

// The FCT, with a little margin. Results outside it aren't useful for a PPA.
export const FCT = { low: { latitude: 8.35, longitude: 6.7 }, high: { latitude: 9.45, longitude: 7.65 } };
export const inFct = (lat: number, lng: number) =>
  lat >= FCT.low.latitude && lat <= FCT.high.latitude && lng >= FCT.low.longitude && lng <= FCT.high.longitude;

/** label: the place's name; area: the neighbourhood or district it's in (shown on listings). */
export type Place = { label: string; area: string; address: string; lat: number; lng: number };

type Part = { types: string[]; long_name?: string; longText?: string };
/** Most specific named area: neighbourhood, then district, then town. Works for both Geocoding and Places parts. */
export function areaName(parts: Part[]): string | undefined {
  for (const t of ["neighborhood", "sublocality_level_1", "sublocality", "locality"]) {
    const p = parts.find((x) => x.types.includes(t));
    const name = p?.long_name ?? p?.longText;
    if (name) return name;
  }
}

export const shortAddress = (a: string) => a.replace(/,?\s*Nigeria$/, "").replace(/\s+\d{6}(?=,|$)/, "");

/** 501 tells the app to fall back to the built-in area list. */
export const notConfigured = () => NextResponse.json({ error: "not_configured" }, { status: 501 });
export const failed = () => NextResponse.json({ error: "Search isn't working right now. Try again." }, { status: 502 });

/** Session tokens group a search and its pick into one Google billing session. */
export const sessionToken = (v: string | null) => (v && /^[\w-]{8,64}$/.test(v) ? v : undefined);
