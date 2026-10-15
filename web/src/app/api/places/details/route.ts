import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_MAPS_KEY, areaName, failed, notConfigured, sessionToken, shortAddress, type Place } from "@/lib/google";

// Coordinates and area for a place picked from search.
export async function GET(req: NextRequest) {
  if (!GOOGLE_MAPS_KEY) return notConfigured();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w-]{10,300}$/.test(id)) return NextResponse.json({ error: "Unknown place" }, { status: 400 });

  const session = sessionToken(req.nextUrl.searchParams.get("session"));
  const url = `https://places.googleapis.com/v1/places/${id}?languageCode=en${session ? `&sessionToken=${session}` : ""}`;
  const res = await fetch(url, {
    headers: { "X-Goog-Api-Key": GOOGLE_MAPS_KEY, "X-Goog-FieldMask": "displayName,formattedAddress,location,addressComponents" },
  }).catch(() => null);
  if (!res?.ok) return failed();

  const p = (await res.json()) as {
    displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number };
    addressComponents?: { longText: string; types: string[] }[];
  };
  if (!p.location) return failed();
  const label = p.displayName?.text ?? p.formattedAddress ?? "Your PPA";
  const place: Place = {
    label,
    area: areaName(p.addressComponents ?? [], p.formattedAddress) ?? label,
    address: shortAddress(p.formattedAddress ?? ""),
    lat: p.location.latitude,
    lng: p.location.longitude,
  };
  return NextResponse.json({ place });
}
