import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_MAPS_KEY, areaName, failed, inFct, notConfigured, shortAddress, type Place } from "@/lib/google";

// Address and area for the phone's current location.
export async function GET(req: NextRequest) {
  if (!GOOGLE_MAPS_KEY) return notConfigured();
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: "Bad location" }, { status: 400 });
  if (!inFct(lat, lng)) return NextResponse.json({ error: "outside" }, { status: 422 });

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat.toFixed(6)},${lng.toFixed(6)}&language=en&key=${GOOGLE_MAPS_KEY}`;
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return failed();

  type Result = { formatted_address: string; address_components: { long_name: string; types: string[] }[] };
  const data = (await res.json()) as { status: string; results?: Result[] };
  const top = data.results?.[0];
  if (data.status !== "OK" || !top) return failed();

  const area = areaName(data.results!.flatMap((r) => r.address_components)) ?? top.formatted_address.split(",")[0];
  const place: Place = { label: area, area, address: shortAddress(top.formatted_address), lat, lng };
  return NextResponse.json({ place });
}
