import "server-only";
import { NextResponse } from "next/server";

/** Server-side Google Maps key (Places API (New) + Geocoding API). Never sent to the browser. */
export const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY ?? "";

// The FCT, with a little margin. Results outside it aren't useful for a PPA.
export const FCT = { low: { latitude: 8.35, longitude: 6.7 }, high: { latitude: 9.45, longitude: 7.65 } };
export const inFct = (lat: number, lng: number) =>
  lat >= FCT.low.latitude && lat <= FCT.high.latitude && lng >= FCT.low.longitude && lng <= FCT.high.longitude;

export type Place = { label: string; address: string; lat: number; lng: number };

/** 501 tells the app to fall back to the built-in area list. */
export const notConfigured = () => NextResponse.json({ error: "not_configured" }, { status: 501 });
export const failed = () => NextResponse.json({ error: "Search isn't working right now. Try again." }, { status: 502 });

/** Session tokens group a search and its pick into one Google billing session. */
export const sessionToken = (v: string | null) => (v && /^[\w-]{8,64}$/.test(v) ? v : undefined);
