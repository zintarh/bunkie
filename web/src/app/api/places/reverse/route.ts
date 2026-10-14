import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_MAPS_KEY, failed, inFct, notConfigured, type Place } from "@/lib/google";

// Name for the phone's current location.
export async function GET(req: NextRequest) {
  if (!GOOGLE_MAPS_KEY) return notConfigured();
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "Bad location" }, { status: 400 });
  if (!inFct(lat, lng)) return NextResponse.json({ error: "outside" }, { status: 422 });

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat.toFixed(6)},${lng.toFixed(6)}&language=en&key=${GOOGLE_MAPS_KEY}`;
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return failed();

  type Part = { long_name: string; types: string[] };
  const data = (await res.json()) as { status: string; results?: { formatted_address: string; address_components: Part[] }[] };
  const top = data.results?.[0];
  if (data.status !== "OK" || !top) return failed();

  // Prefer the most specific named area: neighbourhood, then district, then town.
  const parts = data.results!.flatMap((r) => r.address_components);
  const named = ["neighborhood", "sublocality_level_1", "sublocality", "locality"]
    .map((t) => parts.find((p) => p.types.includes(t))?.long_name)
    .find(Boolean);
  const place: Place = { label: named ?? top.formatted_address.split(",")[0], address: top.formatted_address.replace(/,?\s*Nigeria$/, ""), lat, lng };
  return NextResponse.json({ place });
}
