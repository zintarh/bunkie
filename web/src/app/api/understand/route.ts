import { NextResponse, type NextRequest } from "next/server";
import { findPlace } from "@/lib/google";
import { nearestZone } from "@/lib/places";
import { askClaude, parseRules, type Understood } from "@/lib/understand";

// Turns a typed search ("self con near Utako under 80k") into filters plus a map point.
// Same text, same answer: cached at the edge for a day.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 300);
  if (q.length < 2) return NextResponse.json({ understood: {} });

  const rules = parseRules(q);
  const claude = await askClaude(q);
  // Claude reads looser wording; the rules fill anything it left out.
  const understood: Understood = { ...rules, ...Object.fromEntries(Object.entries(claude ?? {}).filter(([, v]) => v != null && v !== "")) };
  if (understood.pref === "mixed_ok") delete understood.pref;

  const place = understood.place ? await findPlace(understood.place) : null;
  return NextResponse.json(
    {
      understood,
      by: claude ? "claude" : "rules",
      place: place ? { label: place.label, lat: place.lat, lng: place.lng, zoneId: nearestZone(place.lat, place.lng).id } : null,
    },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
