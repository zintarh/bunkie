"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Camera, ChevronRight, CircleDollarSign, House, MapPin, Plus, ReceiptText, ScrollText, Undo2, Wallet } from "lucide-react";
import { BookingRow } from "@/components/BookingRow";
import { TabBar, useToast } from "@/components/ui";
import { errorText, useMe } from "@/lib/auth";
import { LIVE, OPEN, fetchMyBookings, type BookingFull } from "@/lib/bookings";
import { naira } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { supabaseBrowser } from "@/lib/supabase/client";

type MyListing = { id: string; status: string; area_name: string; monthly_total: number; cover_path: string | null; photo_count: number };
const STATUS: Record<string, [string, string]> = {
  draft: ["Draft", "grey"], live: ["Live", "green"], paused: ["Paused", "amber"], flagged: ["In review", "amber"], archived: ["Archived", "grey"],
};

export default function HostHome() {
  const router = useRouter();
  const [me, loading] = useMe();
  const [listings, setListings] = useState<MyListing[] | null>(null);
  const [bookings, setBookings] = useState<BookingFull[]>([]);
  const [payouts, setPayouts] = useState<{ amount_kobo: number; status: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => {
    const db = supabaseBrowser();
    if (!me || !db) return;
    db.from("listings").select("id, status, area_name, monthly_total, cover_path, photo_count").eq("host_id", me.user.id).order("created_at", { ascending: false })
      .then(({ data }) => setListings((data ?? []) as MyListing[]));
    void fetchMyBookings("host").then(setBookings);
    db.from("payouts").select("amount_kobo, status").then(({ data }) => setPayouts(data ?? []));
  }, [me]);

  const start = async () => {
    const db = supabaseBrowser();
    if (!me) return router.push("/signup?next=/host");
    if (!db) return;
    setBusy(true);
    const { data, error } = await db.rpc("start_listing");
    setBusy(false);
    if (error) return showToast(errorText(error));
    router.push(`/host/listing/${data}?step=location`);
  };

  // Wait until we know whether they host, so the dashboard doesn't flash before "Share your room".
  if (loading || (me && listings === null)) {
    return (
      <main className="screen">
        <div className="body" style={{ alignItems: "center", justifyContent: "center" }}><span className="spin dark" aria-label="Loading" /></div>
        <TabBar />
      </main>
    );
  }

  // Not hosting yet: the 6 steps, then start.
  if (!me || listings?.length === 0) {
    const steps = [
      ["Location", MapPin, "t-mint"], ["Room photos", Camera, "t-amber"], ["Room and stay", House, "t-sky"],
      ["Costs", CircleDollarSign, "t-lilac"], ["House rules", ScrollText, "t-coral"], ["Refunds", Undo2, "t-mint"],
    ] as const;
    return (
      <main className="screen">
        <div className="body">
          <div className="hero phero" style={{ margin: "-4px -20px 0" }}><h1 className="h1">Share your room</h1></div>
          <div className="lrows">
            {steps.map(([label, Icon, tile]) => (
              <div key={label} className="lrow"><span className={`tile ${tile}`}><Icon size={20} /></span><span style={{ fontWeight: 600 }}>{label}</span></div>
            ))}
          </div>
          <p className="small">You&apos;ll be at the room to take photos.</p>
        </div>
        <div className="foot"><button className="btn" disabled={busy} onClick={start}>{busy ? <span className="spin" /> : "Start"}</button></div>
        <TabBar />
        {toast}
      </main>
    );
  }

  const needAction = bookings.filter((b) => (b.status === "requested" && b.deadline_at) || (b.status === "viewed" && b.tenant_matched_at) || b.status === "moved_in");
  const others = bookings.filter((b) => !needAction.includes(b) && (OPEN.includes(b.status) || LIVE.includes(b.status)));
  const held = payouts.filter((p) => p.status === "scheduled" || p.status === "processing").reduce((a, p) => a + p.amount_kobo, 0) / 100;
  const paidOut = payouts.filter((p) => p.status === "done").reduce((a, p) => a + p.amount_kobo, 0) / 100;

  return (
    <main className="screen">
      <div className="body" style={{ gap: 16 }}>
        <div className="hero phero" style={{ margin: "-4px -20px 0" }}><h1 className="h1">Hosting</h1></div>
        <div className="grid2">
          <div className="card stack" style={{ gap: 2 }}><span className="small">Coming to you</span><span className="price num" style={{ fontSize: 22 }}>{naira(held)}</span></div>
          <div className="card stack" style={{ gap: 2 }}><span className="small">Paid out</span><span className="price num" style={{ fontSize: 22 }}>{naira(paidOut)}</span></div>
        </div>

        {needAction.length > 0 && (
          <section className="stack" style={{ gap: 10 }}>
            <span className="h2">Needs you</span>
            {needAction.map((b) => <BookingRow key={b.id} b={b} role="host" />)}
          </section>
        )}

        <section className="stack" style={{ gap: 10 }}>
          <div className="between"><span className="h2">Your rooms</span><button className="pill" onClick={start} disabled={busy}><Plus size={16} />Add</button></div>
          {(listings ?? []).map((l) => (
            <Link key={l.id} href={l.status === "draft" ? `/host/listing/${l.id}?step=location` : `/host/listing/${l.id}?step=review`} className="card row" style={{ padding: 10, color: "var(--ink)" }}>
              <span className="photo" style={{ width: 64, height: 64, borderRadius: 14, flexShrink: 0, backgroundImage: l.cover_path ? `url(${photoUrl(l.cover_path)})` : undefined }} />
              <span className="stack" style={{ gap: 2, flex: 1 }}>
                <b>{l.area_name || "New room"}</b>
                <span className="small">{l.monthly_total ? `${naira(l.monthly_total)} a month` : `${l.photo_count} photos`}</span>
                <span className={`badge ${STATUS[l.status]?.[1] ?? "grey"}`} style={{ alignSelf: "flex-start" }}>{STATUS[l.status]?.[0] ?? l.status}</span>
              </span>
              <ChevronRight size={18} color="var(--muted)" />
            </Link>
          ))}
        </section>

        {others.length > 0 && (
          <section className="stack" style={{ gap: 10 }}>
            <span className="h2">Bookings</span>
            {others.map((b) => <BookingRow key={b.id} b={b} role="host" />)}
          </section>
        )}

        <div className="lrows">
          <Link className="lrow" href="/host/payout"><span className="tile t-mint"><Wallet size={20} /></span><span style={{ flex: 1 }}>Payout account</span><ChevronRight size={18} color="var(--muted)" /></Link>
          <Link className="lrow" href="/host/payouts"><span className="tile t-amber"><ReceiptText size={20} /></span><span style={{ flex: 1 }}>Payouts</span><ChevronRight size={18} color="var(--muted)" /></Link>
        </div>
      </div>
      <TabBar />
      {toast}
    </main>
  );
}
