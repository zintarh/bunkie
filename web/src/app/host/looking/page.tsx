"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Clock, Plus } from "lucide-react";
import { RequireAuth } from "@/components/auth";
import { Loading, TopBar, useToast } from "@/components/ui";
import { errorText, useMe } from "@/lib/auth";
import { nudge } from "@/lib/install";
import { ROOM_LABEL, dayLabel, months as monthsLabel, nairaK, weeks as weeksLabel } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { RoomKind, SharePref } from "@/lib/types";

type Want = {
  id: string; first_name: string; batch_label: string | null; verified: boolean; area_label: string; budget_max: number | null;
  move_in: string | null; months: number | null; weeks: number | null; room_kind: RoomKind | null; pref: SharePref; note: string | null;
  created_at: string; minutes: number | null; fits_budget: boolean | null; fits_household: boolean | null; offered: boolean; mine: boolean;
};
type Room = { id: string; area_name: string; monthly_total: number };
const PREF: Record<SharePref, string | null> = { women_only: "Women only", men_only: "Men only", mixed_ok: null };

/** What corpers are looking for. Anyone signed in can see it; a live room can be offered to them. */
function Looking() {
  const router = useRouter();
  const [me] = useMe();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const [rows, setRows] = useState<Want[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    if (!me) return;
    supabaseBrowser()?.from("listings").select("id, area_name, monthly_total").eq("host_id", me.user.id).eq("status", "live")
      .then(({ data }) => {
        const list = (data ?? []) as Room[];
        setRooms(list);
        if (list.length) setRoom(list[0].id);
      });
  }, [me]);

  useEffect(() => {
    if (rooms === null) return;
    setRows(null);
    supabaseBrowser()?.rpc("want_feed", { p_listing: room }).then(({ data }) => setRows(((data ?? []) as Want[]).filter((w) => !w.mine)));
  }, [room, rooms]);

  const offer = async (w: Want) => {
    const db = supabaseBrowser();
    if (!db || !room) return;
    setBusy(w.id);
    const { data, error } = await db.rpc("offer_room", { p_want: w.id, p_listing: room });
    setBusy(null);
    if (error) return showToast(errorText(error));
    nudge("reply", w.first_name);
    router.push(`/inbox/${data}`);
  };

  if (rows === null || rooms === null) return <Loading />;
  return (
    <main className="screen">
      <TopBar back="/host" />
      <div className="body" style={{ gap: 14 }}>
        <div className="stack" style={{ gap: 4 }}>
          <h1 className="h1">Corpers looking</h1>
          <p className="sub">{rows.length} {rows.length === 1 ? "corper is" : "corpers are"} looking for a room.</p>
        </div>

        {rooms.length > 1 && (
          <label className="field">
            <span className="sr-only">Compare with your room</span>
            <select className="sel" style={{ border: 0, padding: 0, height: "100%" }} value={room ?? ""} onChange={(e) => setRoom(e.target.value)}>
              {rooms.map((r) => <option key={r.id} value={r.id}>Your room in {r.area_name || "Abuja"}</option>)}
            </select>
          </label>
        )}
        {rooms.length === 0 && (
          <Link href="/host" className="banner green" style={{ color: "var(--green-text)" }}>
            <Plus size={18} style={{ flexShrink: 0 }} />List a room to offer it to them
          </Link>
        )}

        {rows.length === 0 ? (
          <div className="card stack" style={{ alignItems: "center", textAlign: "center", padding: "28px 20px", gap: 8 }}>
            <span className="h2">No one is looking right now</span>
            <span className="small">Check back soon.</span>
          </div>
        ) : rows.map((w) => {
          const length = w.weeks ? weeksLabel(w.weeks) : w.months ? monthsLabel(w.months) : null;
          const facts = [w.budget_max ? `Under ${nairaK(w.budget_max)}` : null, w.move_in ? `From ${dayLabel(w.move_in).slice(4)}` : null, length,
            w.room_kind ? ROOM_LABEL[w.room_kind] : null, PREF[w.pref]].filter(Boolean) as string[];
          return (
            <div key={w.id} className="card stack" style={{ gap: 10 }}>
              <span style={{ fontSize: 16, lineHeight: 1.4 }}>
                <b>{w.first_name}</b> is looking for a room in <b>{w.area_label}</b>{w.batch_label ? <span className="muted"> · {w.batch_label}</span> : null}
              </span>
              {facts.length > 0 && <span className="small" style={{ fontSize: 14 }}>{facts.join(" · ")}</span>}
              {w.note && <span style={{ fontSize: 14 }}>&ldquo;{w.note}&rdquo;</span>}
              {room && (
                <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {w.minutes != null && <span className="mins"><Clock size={12} />{w.minutes} min from your room</span>}
                  {w.fits_budget === true && <span className="badge green">Fits budget</span>}
                  {w.fits_budget === false && <span className="badge amber">Over budget</span>}
                  {w.fits_household === false && <span className="badge red">Different household</span>}
                </span>
              )}
              {w.offered ? (
                <span className="row small" style={{ gap: 6, color: "var(--green-text)", fontWeight: 700 }}><Check size={16} />Offered</span>
              ) : room ? (
                <button className="btn sm" disabled={busy === w.id || w.fits_household === false} onClick={() => offer(w)}>
                  {busy === w.id ? <span className="spin" /> : "Offer my room"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {toast}
    </main>
  );
}

export default function Page() {
  return <RequireAuth next="/host/looking"><Looking /></RequireAuth>;
}
