import { NextResponse, type NextRequest } from "next/server";
import { searchRooms } from "@/lib/rooms";
import type { RoomKind, SearchParams, SharePref } from "@/lib/types";

// Cached at the edge per filter set, so thousands of people browsing barely reach the database.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const int = (k: string) => (q.get(k) ? Math.max(0, parseInt(q.get(k)!, 10) || 0) : undefined);
  const pick = <T extends string>(k: string, allowed: readonly T[]) => (allowed.includes(q.get(k) as T) ? (q.get(k) as T) : undefined);
  const moveIn = q.get("moveIn");
  const coord = (k: string, min: number, max: number) => {
    const v = Number(q.get(k));
    return q.get(k) && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 1000) / 1000 : undefined;
  };

  const params: SearchParams = {
    mode: pick("mode", ["camp", "ppa", "any"] as const) ?? "any",
    moveIn: moveIn && /^\d{4}-\d{2}-\d{2}$/.test(moveIn) ? moveIn : undefined,
    zone: int("zone"),
    // Rounded so near-identical searches share a cache entry: ~100 m for the point, ₦5k for budget.
    lat: coord("lat", 8.3, 9.5),
    lng: coord("lng", 6.7, 7.7),
    budgetMax: int("budgetMax") ? Math.ceil(int("budgetMax")! / 5000) * 5000 : undefined,
    pref: pick<SharePref>("pref", ["women_only", "men_only", "mixed_ok"]),
    room: pick<RoomKind>("room", ["own_room", "shared_room"]),
    stay: pick("stay", ["weeks", "short", "long", "any"] as const),
    maxMinutes: int("maxMinutes"),
  };

  try {
    const rooms = await searchRooms(params);
    return NextResponse.json(
      { rooms },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json({ error: "Search is busy. Try again in a moment." }, { status: 503 });
  }
}
