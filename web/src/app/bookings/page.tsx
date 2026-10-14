"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { BookingRow } from "@/components/BookingRow";
import { Loading, Seg, TabBar } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { LIVE, OPEN, fetchMyBookings, type BookingFull } from "@/lib/bookings";

export default function Bookings() {
  const [me, loading] = useMe();
  const [tab, setTab] = useState<"active" | "past">("active");
  const [list, setList] = useState<BookingFull[] | null>(null);

  useEffect(() => {
    if (me) void fetchMyBookings("tenant").then(setList);
  }, [me]);

  const active = (list ?? []).filter((b) => OPEN.includes(b.status) || LIVE.includes(b.status));
  const past = (list ?? []).filter((b) => !OPEN.includes(b.status) && !LIVE.includes(b.status));
  const open = (list ?? []).filter((b) => OPEN.includes(b.status)).length;
  const shown = tab === "active" ? active : past;

  if (loading) return <Loading tabs />;

  return (
    <main className="screen">
      <div className="body" style={{ gap: 12 }}>
        <div className="hero phero" style={{ margin: "-4px -20px 0" }}><h1 className="h1">Bookings</h1></div>
        {!loading && !me ? (
          <div className="card stack" style={{ gap: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 17 }}>Sign up to see your bookings</span>
            <Link className="btn" href="/signup?next=/bookings">Sign up</Link>
          </div>
        ) : (
          <>
            <Seg label="Bookings" value={tab} onChange={setTab} options={[{ value: "active", label: "Active" }, { value: "past", label: "Past" }]} />
            {tab === "active" && open > 0 && (
              <div className="banner green">You can send {Math.max(0, 3 - open)} more {3 - open === 1 ? "request" : "requests"}. The others close when one is booked.</div>
            )}
            {list && shown.length === 0 && (
              <div className="card stack" style={{ alignItems: "center", textAlign: "center", padding: "28px 20px", gap: 10 }}>
                <span className="tile t-mint" style={{ width: 56, height: 56, borderRadius: 999 }}><CalendarDays size={26} /></span>
                <span className="h2">{tab === "active" ? "No requests yet" : "Nothing here yet"}</span>
                {tab === "active" && <Link className="btn" href="/explore">Find a room</Link>}
              </div>
            )}
            <div className="stack" style={{ gap: 12 }}>
              {shown.map((b) => <BookingRow key={b.id} b={b} role="tenant" />)}
            </div>
          </>
        )}
      </div>
      <TabBar />
    </main>
  );
}
