import { NextResponse, type NextRequest } from "next/server";
import { searchRooms } from "@/lib/rooms";
import type { RoomKind, SearchParams, SharePref } from "@/lib/types";

// Cached at the edge per filter set, so thousands of people browsing barely reach the database.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const int = (k: string) => (q.get(k) ? Math.max(0, parseInt(q.get(k)!, 10) || 0) : undefined);
  const pick = <T extends string>(k: string, allowed: readonly T[]) => (allowed.includes(q.get(k) as T) ? (q.get(k) as T) : undefined);
  const moveIn = q.get("moveIn");

  const params: SearchParams = {
    mode: pick("mode", ["camp", "ppa", "any"] as const) ?? "any",
    moveIn: moveIn && /^\d{4}-\d{2}-\d{2}$/.test(moveIn) ? moveIn : undefined,
    zone: int("zone"),
    // Round prices to the nearest ₦5k so near-identical filters share a cache entry.
    priceMin: int("priceMin") !== undefined ? Math.floor(int("priceMin")! / 5000) * 5000 : undefined,
    priceMax: int("priceMax") !== undefined ? Math.ceil(int("priceMax")! / 5000) * 5000 : undefined,
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
