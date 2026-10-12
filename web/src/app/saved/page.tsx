"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { RoomCard } from "@/components/RoomCard";
import { TabBar } from "@/components/ui";
import { useSaved } from "@/lib/saved";
import type { RoomCard as Room } from "@/lib/types";

export default function Saved() {
  const [saved, toggle] = useSaved();
  const [rooms, setRooms] = useState<Room[] | null>(null);

  // Saved rooms come from the same cached search, filtered to the saved ids.
  useEffect(() => {
    fetch("/api/search?mode=any&priceMax=10000000")
      .then((r) => r.json())
      .then((j) => setRooms(j.rooms ?? []))
      .catch(() => setRooms([]));
  }, []);

  const list = (rooms ?? []).filter((r) => saved.has(r.id));
  return (
    <main className="screen">
      <div className="body" style={{ padding: "0 16px 24px" }}>
        <div className="hero phero" style={{ margin: "0 -16px" }}><h1 className="h1">Saved</h1></div>
        {rooms && list.length === 0 ? (
          <div className="card stack" style={{ alignItems: "center", textAlign: "center", padding: "32px 20px", gap: 10 }}>
            <span className="tile t-coral" style={{ width: 56, height: 56, borderRadius: 999 }}><Heart size={26} /></span>
            <span className="h2">No saved rooms yet</span>
            <span className="small" style={{ fontSize: 15 }}>Tap the heart on any room.</span>
            <Link className="btn" href="/explore" style={{ marginTop: 8 }}>Explore rooms</Link>
          </div>
        ) : (
          <div className="rise stack" style={{ gap: 16 }}>
            {list.map((r) => <RoomCard key={r.id} room={r} saved onToggleSave={() => toggle(r.id)} />)}
          </div>
        )}
      </div>
      <TabBar />
    </main>
  );
}
