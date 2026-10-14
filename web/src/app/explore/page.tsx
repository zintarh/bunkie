"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MapPin, SlidersHorizontal, Tent, Video } from "lucide-react";
import { ContinueHosting } from "@/components/ContinueHosting";
import { Filters, activeFilterCount } from "@/components/Filters";
import { RoomCard } from "@/components/RoomCard";
import { Loading, TabBar, Wordmark } from "@/components/ui";
import { fit } from "@/lib/bunkie";
import { dayLabel } from "@/lib/format";
import { BATCHES } from "@/lib/places";
import { usePrefs } from "@/lib/prefs";
import { useSaved } from "@/lib/saved";
import { useMyAnswers } from "@/lib/useMyAnswers";
import type { RoomCard as Room } from "@/lib/types";

export default function Explore() {
  const router = useRouter();
  const [prefs, ready] = usePrefs();
  const [saved, toggleSave] = useSaved();
  const myAnswers = useMyAnswers();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (ready && !prefs.stage) router.replace("/start");
  }, [ready, prefs.stage, router]);

  const inCamp = prefs.stage === "in_camp";
  const batch = BATCHES.find((b) => b.id === prefs.batchId);
  const f = prefs.filters;

  const query = useMemo(() => {
    const q = new URLSearchParams();
    q.set("mode", inCamp ? "camp" : prefs.ppa ? "ppa" : "any");
    if (inCamp && batch) q.set("moveIn", batch.campEnd);
    else if (f.moveIn) q.set("moveIn", f.moveIn);
    if (!inCamp && prefs.ppa) q.set("zone", String(prefs.ppa.zoneId));
    q.set("priceMin", String(f.priceMin));
    q.set("priceMax", String(f.priceMax >= 150000 ? 10_000_000 : f.priceMax));
    if (prefs.pref) q.set("pref", prefs.pref);
    if (f.room) q.set("room", f.room);
    q.set("stay", inCamp ? "short" : f.stay);
    if (f.maxMinutes && !inCamp) q.set("maxMinutes", String(f.maxMinutes));
    return q.toString();
  }, [inCamp, batch, prefs.ppa, prefs.pref, f]);

  useEffect(() => {
    if (!ready || !prefs.stage) return;
    let live = true;
    setError(null);
    fetch(`/api/search?${query}`)
      .then((r) => r.json())
      .then((j) => live && (j.error ? setError(j.error) : setRooms(j.rooms)))
      .catch(() => live && setError("No connection. Pull down to try again."));
    return () => {
      live = false;
    };
  }, [query, ready, prefs.stage]);

  // Corper hosts stay first (search already puts them there). Once the person has answered the
  // bunkie questions, closer fits rise to the top within each group.
  const ranked = useMemo(() => {
    if (!rooms) return null;
    const withFit = rooms.map((r) => ({ r, fit: fit(myAnswers, r.host_answers)?.score ?? null }));
    const corper = (r: Room) => (r.host_corper === "serving" || r.host_corper === "served" ? 0 : 1);
    if (myAnswers) {
      withFit.sort((a, b) => corper(a.r) - corper(b.r)
        || (b.fit ?? 0) - (a.fit ?? 0) + ((a.r.commute_min ?? 0) - (b.r.commute_min ?? 0)) / 4);
    }
    return withFit;
  }, [rooms, myAnswers]);

  const nFilters = activeFilterCount(f, inCamp);

  // Wait for the phone's saved choices, so the PPA bar doesn't flash "Add your PPA" first.
  if (!ready || !prefs.stage) return <Loading tabs />;

  return (
    <main className="screen">
      <div className="hero" style={{ flexShrink: 0, paddingBottom: 16 }}>
        <div style={{ padding: "14px 20px 2px" }}><Wordmark /></div>
        <div className="row" style={{ padding: "10px 16px 4px", gap: 10 }}>
          <Link href={inCamp ? "/start" : "/ppa"}
            style={{ flex: 1, minWidth: 0, height: 56, borderRadius: 999, background: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,.18)", display: "flex", alignItems: "center", gap: 12, padding: "0 18px", color: "var(--ink)" }}>
            {inCamp ? <Tent size={20} color="var(--green)" strokeWidth={2.2} /> : <MapPin size={20} color="var(--green)" strokeWidth={2.2} />}
            <span className="stack" style={{ gap: 0, minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {inCamp ? `Abuja · leaving camp ${batch ? dayLabel(batch.campEnd).slice(4) : ""}` : prefs.ppa?.label ?? "Add your PPA"}
              </span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{inCamp ? "No PPA yet · tap to change" : "Your PPA"}</span>
            </span>
          </Link>
          <button onClick={() => setShowFilters(true)} aria-label={`Filters, ${nFilters} active`}
            style={{ position: "relative", width: 56, height: 56, borderRadius: 999, border: 0, background: "#fff", boxShadow: "var(--shadow-card)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink)", flexShrink: 0 }}>
            <SlidersHorizontal size={22} strokeWidth={2.2} />
            {nFilters > 0 && (
              <span style={{ position: "absolute", right: 6, top: 6, minWidth: 18, height: 18, borderRadius: 999, background: "var(--amber)", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{nFilters}</span>
            )}
          </button>
        </div>
      </div>

      <div className="body" style={{ padding: "4px 16px 24px", gap: 0 }}>
        <ContinueHosting style={{ marginTop: 14 }} />
        {inCamp && (
          <div className="row card" style={{ marginTop: 14, padding: "12px 14px", borderRadius: 18 }}>
            <span className="tile t-amber"><Video size={20} strokeWidth={2.2} /></span>
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>View by video call from camp. Free switch once you get your PPA.</span>
          </div>
        )}
        {ranked?.length !== 0 && <span className="lbl" style={{ display: "block", padding: "12px 2px" }}>
          {ranked == null && !error ? "Finding apartments…" : ranked ? `${ranked.length} ${ranked.length === 1 ? "apartment" : "apartments"}${inCamp ? " free on your camp exit day" : ""}` : ""}
        </span>}
        {error && <p className="err" role="alert">{error}</p>}
        {ranked == null && !error && <Skeletons />}
        {ranked && ranked.length > 0 && (
          <div className="rise stack" style={{ gap: 16 }}>
            {ranked.map(({ r, fit }) => (
              <RoomCard key={r.id} room={r} saved={saved.has(r.id)} onToggleSave={() => toggleSave(r.id)} fitScore={fit}
                minutesLabel={inCamp ? (r.ease_min != null ? `${r.ease_min} min to centre` : null) : r.commute_min != null ? `${r.commute_min} min` : null} />
            ))}
          </div>
        )}
        {ranked && ranked.length === 0 && (
          <div className="stack" style={{ padding: "40px 8px", alignItems: "center", textAlign: "center", gap: 12 }}>
            <span className="h2">No apartments match</span>
            <button className="pill" style={{ height: 44 }} onClick={() => setShowFilters(true)}>Change filters</button>
          </div>
        )}
      </div>

      <TabBar />
      {showFilters && <Filters inCamp={inCamp} onClose={() => setShowFilters(false)} />}
    </main>
  );
}

function Skeletons() {
  return (
    <div className="stack" style={{ gap: 16 }} aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="rcard">
          <div style={{ height: 200, borderRadius: 18, background: "#EEF2EF" }} />
          <div style={{ height: 18, width: "50%", borderRadius: 6, background: "#EEF2EF", margin: "0 8px" }} />
          <div style={{ height: 14, width: "70%", borderRadius: 6, background: "#F3F6F3", margin: "0 8px 10px" }} />
        </div>
      ))}
    </div>
  );
}
