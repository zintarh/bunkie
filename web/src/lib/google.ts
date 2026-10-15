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
/**
 * The area people would name. Google's address usually reads "street, AREA, Abuja ...", and that AREA
 * can differ from Google's own neighbourhood tag (e.g. "Mafemi Cres, Utako" is tagged Mabushi), so the
 * address wins. Otherwise: neighbourhood, then district, then town. Works for Geocoding and Places parts.
 */
export function areaName(parts: Part[], address?: string): string | undefined {
  const segs = (address ?? "").split(",").map((s) => s.trim());
  const city = segs.findIndex((s) => /^Abuja\b/i.test(s));
  const before = city > 0 ? segs[city - 1] : "";
  if (before && !/\d/.test(before) && !/\b(street|st|road|rd|way|close|crescent|cres|avenue|ave|drive|lane|expressway)\b/i.test(before)) return before;
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

/** The best match for a typed place in the FCT (one Text Search call), or null. */
export async function findPlace(text: string): Promise<Place | null> {
  if (!GOOGLE_MAPS_KEY || !text.trim()) return null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_MAPS_KEY,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.addressComponents",
    },
    body: JSON.stringify({ textQuery: `${text}, Abuja`, locationRestriction: { rectangle: FCT }, languageCode: "en", pageSize: 1 }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const p = ((await res.json()) as { places?: { displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; addressComponents?: { longText: string; types: string[] }[] }[] }).places?.[0];
  if (!p?.location) return null;
  const label = p.displayName?.text ?? text;
  return { label, area: areaName(p.addressComponents ?? [], p.formattedAddress) ?? label, address: shortAddress(p.formattedAddress ?? ""), lat: p.location.latitude, lng: p.location.longitude };
}
