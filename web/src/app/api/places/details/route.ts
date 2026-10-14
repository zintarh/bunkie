import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_MAPS_KEY, failed, notConfigured, sessionToken, type Place } from "@/lib/google";

// Coordinates for a place picked from search.
export async function GET(req: NextRequest) {
  if (!GOOGLE_MAPS_KEY) return notConfigured();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w-]{10,300}$/.test(id)) return NextResponse.json({ error: "Unknown place" }, { status: 400 });

  const session = sessionToken(req.nextUrl.searchParams.get("session"));
  const url = `https://places.googleapis.com/v1/places/${id}?languageCode=en${session ? `&sessionToken=${session}` : ""}`;
  const res = await fetch(url, {
    headers: { "X-Goog-Api-Key": GOOGLE_MAPS_KEY, "X-Goog-FieldMask": "displayName,formattedAddress,location" },
  }).catch(() => null);
  if (!res?.ok) return failed();

  const p = (await res.json()) as { displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } };
  if (!p.location) return failed();
  const place: Place = {
    label: p.displayName?.text ?? p.formattedAddress ?? "Your PPA",
    address: (p.formattedAddress ?? "").replace(/,?\s*Nigeria$/, ""),
    lat: p.location.latitude,
    lng: p.location.longitude,
  };
  return NextResponse.json({ place });
}
