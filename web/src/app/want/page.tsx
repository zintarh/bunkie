"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPin, Sparkles, X } from "lucide-react";
import { PlaceSearch, type Place } from "@/components/PlaceSearch";
import { RequireAuth } from "@/components/auth";
import { Loading, Seg, Stepper, TopBar } from "@/components/ui";
import { errorText } from "@/lib/auth";
import { ROOM_LABEL, dayLabel, months as monthsLabel, naira, weeks as weeksLabel } from "@/lib/format";
import { nearestZone } from "@/lib/places";
import { usePrefs } from "@/lib/prefs";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { RoomKind, SharePref } from "@/lib/types";

type Area = { label: string; lat: number; lng: number; zoneId: number };
type Mine = { id: string; area_label: string; lat: number; lng: number; zone_id: number | null; pref: SharePref; budget_max: number | null; move_in: string | null; months: number | null; weeks: number | null;
  room_kind: RoomKind | null; note: string | null; until: string; matches: number; offers: number };

/** "Post what you need": type it, check the form it fills, post. Shows your open post if you have one. */
function Want() {
  const [prefs] = usePrefs();
  const [mine, setMine] = useState<Mine | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [area, setArea] = useState<Area | null>(prefs.ppa ? { label: prefs.ppa.label, lat: prefs.ppa.lat, lng: prefs.ppa.lng, zoneId: prefs.ppa.zoneId } : null);
  const [pickArea, setPickArea] = useState(false);
  const [budget, setBudget] = useState(0);
  const [moveIn, setMoveIn] = useState("");
  const [unit, setUnit] = useState<"months" | "weeks">("months");
  const [len, setLen] = useState(3);
  const [room, setRoom] = useState<RoomKind | "any">("any");
  const [pref, setPref] = useState<SharePref>(prefs.pref ?? "mixed_ok");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => supabaseBrowser()?.rpc("my_want").then(({ data }) => setMine(((data as Mine[]) ?? [])[0] ?? null));
  useEffect(() => void load(), []);

  // Typing fills the form (same reader as search).
  const read = async () => {
    const q = text.trim();
    if (q.length < 2) return;
    setReading(true);
    try {
      const r = await (await fetch(`/api/understand?q=${encodeURIComponent(q.toLowerCase())}`)).json();
      const u = r.understood ?? {};
      if (r.place) setArea(r.place);
      if (u.budgetMax) setBudget(u.budgetMax);
      if (u.room) setRoom(u.room);
      if (u.pref) setPref(u.pref);
      if (u.weeks) { setUnit("weeks"); setLen(u.weeks); } else if (u.months) { setUnit("months"); setLen(u.months); }
    } finally {
      setReading(false);
    }
  };

  const post = async () => {
    const db = supabaseBrowser();
    if (!db || !area) return;
    setBusy(true);
    setError(null);
    const { error } = await db.rpc("post_want", {
      p_area: area.label, p_lat: area.lat, p_lng: area.lng, p_zone: area.zoneId, p_budget: budget || null,
      p_move_in: moveIn || null, p_months: unit === "months" ? len : null, p_weeks: unit === "weeks" ? len : null,
      p_room: room === "any" ? null : room, p_pref: pref, p_note: note || null,
    });
    setBusy(false);
    if (error) return setError(errorText(error));
    setEditing(false);
    await load();
  };

  const edit = () => {
    if (!mine) return;
    setArea({ label: mine.area_label, lat: mine.lat, lng: mine.lng, zoneId: mine.zone_id ?? nearestZone(mine.lat, mine.lng).id });
    setPickArea(false);
    setPref(mine.pref);
    setBudget(mine.budget_max ?? 0);
    setMoveIn(mine.move_in ?? "");
    if (mine.weeks) { setUnit("weeks"); setLen(mine.weeks); } else { setUnit("months"); setLen(mine.months ?? 3); }
    setRoom(mine.room_kind ?? "any");
    setNote(mine.note ?? "");
    setEditing(true);
  };

  const close = async () => {
    if (!mine) return;
    await supabaseBrowser()?.rpc("close_want", { p_want: mine.id });
    setMine(null);
  };

  if (mine === undefined) return <Loading />;

  // Your open post.
  if (mine && !editing) {
    const length = mine.weeks ? weeksLabel(mine.weeks) : mine.months ? monthsLabel(mine.months) : null;
    return (
      <main className="screen">
        <TopBar back="/explore" />
        <div className="body">
          <h1 className="h1">You&apos;re looking in {mine.area_label}</h1>
          <div className="card stack" style={{ gap: 8 }}>
            {[mine.budget_max ? `Under ${naira(mine.budget_max)} a month` : null, mine.move_in ? `From ${dayLabel(mine.move_in)}` : null, length,
              mine.room_kind ? ROOM_LABEL[mine.room_kind] : null].filter(Boolean).map((t) => <span key={t!} style={{ fontSize: 15 }}>{t}</span>)}
            {mine.note && <span className="small" style={{ fontSize: 14 }}>&ldquo;{mine.note}&rdquo;</span>}
            <span className="small">Showing until {dayLabel(mine.until.slice(0, 10))}</span>
          </div>
          <div className="lrows">
            <Link className="lrow" href={`/explore?q=${encodeURIComponent(`near ${mine.area_label}${mine.budget_max ? ` under ${mine.budget_max}` : ""}`)}`}>
              <span className="tile t-mint"><Sparkles size={20} /></span>
              <span style={{ flex: 1 }}>{mine.matches} {mine.matches === 1 ? "room matches" : "rooms match"} already</span>
            </Link>
            <Link className="lrow" href="/inbox">
              <span className="tile t-amber"><MapPin size={20} /></span>
              <span style={{ flex: 1 }}>{mine.offers} {mine.offers === 1 ? "host has" : "hosts have"} offered a room</span>
            </Link>
          </div>
        </div>
        <div className="foot">
          <button className="btn ghost" onClick={edit}>Change it</button>
          <button className="link" onClick={close}>Take it down</button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <TopBar back="/explore" />
      <div className="body" style={{ gap: 18 }}>
        <h1 className="h1">Post what you need</h1>

        <form className="smart" style={{ boxShadow: "none", background: "var(--soft)" }} onSubmit={(e) => { e.preventDefault(); void read(); }}>
          <Sparkles size={18} color="var(--green)" style={{ flexShrink: 0 }} aria-hidden="true" />
          <label htmlFor="want-q" className="sr-only">Describe it</label>
          <input id="want-q" value={text} onChange={(e) => setText(e.target.value)} placeholder="Self con near Utako under 80k for 3 months" />
          <button type="submit" className="go" disabled={reading} aria-label="Fill the form">{reading ? <span className="spin" /> : "Fill"}</button>
        </form>

        <div className="stack">
          <span className="lbl">Area</span>
          {area && !pickArea ? (
            <div className="field" style={{ justifyContent: "space-between" }}>
              <span className="row" style={{ gap: 8 }}><MapPin size={18} color="var(--green)" />{area.label}</span>
              <button className="ib" onClick={() => setPickArea(true)} aria-label="Change area"><X size={18} /></button>
            </div>
          ) : (
            <PlaceSearch placeholder="Your PPA or area" onPick={(p: Place) => { setArea({ label: p.area || p.label, lat: p.lat, lng: p.lng, zoneId: nearestZone(p.lat, p.lng).id }); setPickArea(false); }} />
          )}
        </div>

        <div className="stack">
          <label className="lbl" htmlFor="budget">Monthly budget <span style={{ fontWeight: 500 }}>· optional</span></label>
          <label className="field"><span className="prefix">₦</span>
            <input id="budget" inputMode="numeric" value={budget ? budget.toLocaleString("en-NG") : ""} onChange={(e) => setBudget(parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)} /></label>
        </div>

        <div className="stack">
          <label className="lbl" htmlFor="movein">Move in <span style={{ fontWeight: 500 }}>· optional</span></label>
          <label className="field"><input id="movein" type="date" min={new Date().toISOString().slice(0, 10)} value={moveIn} onChange={(e) => setMoveIn(e.target.value)} /></label>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <Seg label="Stay length" value={unit} onChange={(v) => { setUnit(v); setLen(v === "weeks" ? 2 : 3); }} options={[{ value: "weeks", label: "Weeks" }, { value: "months", label: "Months" }]} />
          <div className="between"><span className="h2" style={{ fontSize: 16 }}>How long</span>
            {unit === "weeks"
              ? <Stepper value={len} min={1} max={4} onChange={setLen} format={weeksLabel} label="weeks" />
              : <Stepper value={len} min={1} max={12} onChange={setLen} format={monthsLabel} label="months" />}
          </div>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <span className="lbl">Room</span>
          <Seg label="Room" value={room} onChange={setRoom} options={[{ value: "any", label: "Any" }, { value: "own_room", label: "Own room" }, { value: "self_contain", label: "Self con" }, { value: "shared_room", label: "Shared" }]} />
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="lbl">Share a home with</span>
          <Seg label="Share a home with" value={pref} onChange={setPref} options={[{ value: "women_only", label: "Women only" }, { value: "men_only", label: "Men only" }, { value: "mixed_ok", label: "Mixed is fine" }]} />
        </div>
        <div className="stack">
          <label className="lbl" htmlFor="note">Anything else <span style={{ fontWeight: 500 }}>· optional</span></label>
          <label className="field"><input id="note" maxLength={200} placeholder="Quiet, I work at the Secretariat" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </div>
        <p className="small">Hosts see your first name, the area and your batch. Never your photo, number or email.</p>
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <div className="foot">
        <button className="btn" disabled={!area || busy} onClick={post}>{busy ? <span className="spin" /> : mine ? "Update post" : "Post it"}</button>
        {editing && <button className="link" onClick={() => setEditing(false)}>Cancel</button>}
      </div>
    </main>
  );
}

export default function Page() {
  return <RequireAuth next="/want"><Want /></RequireAuth>;
}
