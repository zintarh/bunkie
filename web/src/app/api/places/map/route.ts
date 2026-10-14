import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_MAPS_KEY, inFct } from "@/lib/google";

// A map image from Google, cached at the edge for a month so each spot is fetched from Google about once.
// pin=1 marks the exact point; otherwise the map is just centred (the app draws an approximate-area circle).
const STYLE = [
  "feature:poi.business|visibility:off",
  "feature:poi|element:labels.icon|visibility:off",
  "feature:transit|visibility:simplified",
  "feature:landscape|color:0xf3f6f2",
  "feature:water|color:0xbfe3d0",
  "feature:road.highway|element:geometry|color:0xfde9b8",
].map((s) => `&style=${encodeURIComponent(s)}`).join("");

export async function GET(req: NextRequest) {
  if (!GOOGLE_MAPS_KEY) return new NextResponse(null, { status: 501 });
  const q = req.nextUrl.searchParams;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inFct(lat, lng)) return new NextResponse(null, { status: 400 });
  const zoom = Math.min(17, Math.max(11, parseInt(q.get("zoom") ?? "15", 10) || 15));
  const center = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const pin = q.get("pin") === "1" ? `&markers=${encodeURIComponent(`color:0x17A862|${center}`)}` : "";

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=${zoom}&size=640x320&scale=2&format=png${pin}${STYLE}&key=${GOOGLE_MAPS_KEY}`,
  ).catch(() => null);
  if (!res?.ok || !res.headers.get("content-type")?.startsWith("image/")) return new NextResponse(null, { status: 502 });

  return new NextResponse(res.body, {
    headers: { "Content-Type": res.headers.get("content-type")!, "Cache-Control": "public, max-age=86400, s-maxage=2592000, immutable" },
  });
}
