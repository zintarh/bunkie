"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MapPin, SlidersHorizontal, Tent, Users, Video } from "lucide-react";
import { ContinueHosting } from "@/components/ContinueHosting";
import { LookingStrip, MyWantCard } from "@/components/Wants";
import { InstallCard } from "@/components/InstallPrompt";
import { HomeRail } from "@/components/DesktopFrame";
import { Filters, activeFilterCount } from "@/components/Filters";
import { ChatIcon } from "@/components/icons";
import { useMe } from "@/lib/auth";
import { useUnreadChats } from "@/lib/chat";
import { RoomCard } from "@/components/RoomCard";
import { SmartSearch } from "@/components/SmartSearch";
import { Loading, TabBar, Wordmark } from "@/components/ui";
import { fit } from "@/lib/bunkie";
import { dayLabel } from "@/lib/format";
import { BATCHES } from "@/lib/places";
import { usePrefs, type StayLength } from "@/lib/prefs";
import { useSaved } from "@/lib/saved";
import { useMyAnswers } from "@/lib/useMyAnswers";
import type { Miss, RoomCard as Room, SearchIntent } from "@/lib/types";

const topIcon: React.CSSProperties = { position: "relative", width: 44, height: 44, borderRadius: 999, background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" };
const countDot: React.CSSProperties = { position: "absolute", right: 2, top: 2, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" };

export default function Explore() {
  const router = useRouter();
  const [prefs, ready] = usePrefs();
  const [saved, toggleSave] = useSaved();
  const [me] = useMe();
  const unreadChats = useUnreadChats();
  const myAnswers = useMyAnswers();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState<SearchIntent | null>(null);
  // A search typed in the laptop top bar arrives as ?q=.
  const [initialQ] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("q") ?? ""));

  useEffect(() => {
    if (ready && !prefs.stage) router.replace("/start");
  }, [ready, prefs.stage, router]);

  const inCamp = prefs.stage === "in_camp";
  const batch = BATCHES.find((b) => b.id === prefs.batchId);
  const f = prefs.filters;
  // Exact stay length: a typed search ("3 months") beats the saved filter. Camp stays have their own rules.
  const u0 = search?.understood;
  const length: StayLength | null = inCamp ? null
    : u0?.weeks ? { unit: "weeks", n: u0.weeks } : u0?.months ? { unit: "months", n: u0.months } : f.length;

  const query = useMemo(() => {
    const q = new URLSearchParams();
    q.set("mode", inCamp ? "camp" : prefs.ppa ? "ppa" : "any");
    if (inCamp && batch) q.set("moveIn", batch.campEnd);
    else if (f.moveIn) q.set("moveIn", f.moveIn);
    if (!inCamp && prefs.ppa) {
      // The exact PPA point ranks by real distance; the zone adds Google drive times when it's close.
      q.set("lat", prefs.ppa.lat.toFixed(3));
      q.set("lng", prefs.ppa.lng.toFixed(3));
      q.set("zone", String(prefs.ppa.zoneId));
    }
    if (f.budget) q.set("budgetMax", String(f.budget));
    if (prefs.pref) q.set("pref", prefs.pref);
    if (f.room) q.set("room", f.room);
    // The search knows stay buckets; the exact length is checked per room below.
    q.set("stay", !length ? "any" : length.unit === "weeks" ? "weeks" : length.n <= 3 ? "short" : length.n >= 6 ? "long" : "any");
    if (f.maxMinutes && !inCamp) q.set("maxMinutes", String(f.maxMinutes));
    // A typed search overrides the saved choices for this search only.
    if (search) {
      const u = search.understood;
      if (search.place) {
        if (!inCamp) q.set("mode", "ppa");
        q.set("lat", search.place.lat.toFixed(3));
        q.set("lng", search.place.lng.toFixed(3));
        q.set("zone", String(search.place.zoneId));
      }
      if (u.budgetMax) q.set("budgetMax", String(u.budgetMax));
      if (u.room) q.set("room", u.room);
      if (!u.weeks && !u.months && u.stay && !inCamp) q.set("stay", u.stay);
      if (u.pref) q.set("pref", u.pref);
      if (u.maxMinutes) q.set("maxMinutes", String(u.maxMinutes));
    }
    return q.toString();
  }, [inCamp, batch, prefs.ppa, prefs.pref, f, search, length?.unit, length?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || !prefs.stage) return;
    let live = true;
    setError(null);
    fetch(`/api/search?${query}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.error) return setError(j.error);
        setRooms(j.rooms);
        setHidden(j.hiddenByHousehold ?? 0);
      })
      .catch(() => live && setError("No connection. Pull down to try again."));
    return () => {
      live = false;
    };
  }, [query, ready, prefs.stage]);

  // The search ranks rooms (commute, price, corper host, ...). Personal bunkie fit is added here, on the
  // phone, so searches stay cacheable. Exact matches first, then close matches with what's different.
  const ranked = useMemo(() => {
    if (!rooms) return null;
    // Asked for in a typed search but not a search filter: own bathroom, furnished. Rooms without them
    // become close matches that say so.
    const want = search?.understood;
    const withFit = rooms.map((r0) => {
      const extra: Miss[] = [];
      if (want?.ownBath && r0.bath_kind !== "own" && r0.room_kind !== "self_contain") extra.push({ kind: "shared_bath" });
      if (want?.furnished && !r0.furnished) extra.push({ kind: "unfurnished" });
      // Exact stay length: rooms that don't allow it become close matches that say why.
      const has = (k: Miss["kind"]) => (r0.misses ?? []).some((m) => m.kind === k);
      if (length?.unit === "months") {
        if (r0.min_months > length.n && !has("min_stay")) extra.push({ kind: "min_stay", months: r0.min_months });
        if (r0.max_months < length.n && !has("max_stay")) extra.push({ kind: "max_stay", months: r0.max_months });
      } else if (length?.unit === "weeks" && !r0.open_to_short && !has("no_short")) extra.push({ kind: "no_short" });
      const r = extra.length ? { ...r0, exact: false, misses: [...(r0.misses ?? []), ...extra] } : r0;
      const f = fit(myAnswers, r.host_answers)?.score ?? null;
      return { r, fit: f, score: (r.match_score ?? 0) - 8 * extra.length + (f != null ? (15 * f) / 100 : 0) };
    });
    withFit.sort((a, b) => Number(b.r.exact !== false) - Number(a.r.exact !== false) || b.score - a.score);
    return withFit;
  }, [rooms, myAnswers, search, length?.unit, length?.n]);
  const exact = ranked?.filter(({ r }) => r.exact !== false) ?? null;
  const close = ranked?.filter(({ r }) => r.exact === false) ?? [];
  // Few rooms fit: posting what you need leads, and corpers already looking show under the rooms.
  const few = exact != null && exact.length < 3;

  const nFilters = activeFilterCount(f, inCamp);

  // Wait for the phone's saved choices, so the PPA bar doesn't flash "Add your PPA" first.
  if (!ready || !prefs.stage) return <Loading tabs />;

  return (
    <main className="screen">
      <div className="hero" style={{ flexShrink: 0, paddingBottom: 16 }}>
        <div className="between mob-only" style={{ padding: "10px 16px 0 20px" }}>
          <Wordmark />
          <span className="row" style={{ gap: 8 }}>
            {me && (
              <Link href="/inbox" aria-label={unreadChats ? `Messages, ${unreadChats} unread` : "Messages"} style={topIcon}>
                <ChatIcon size={23} />
                {unreadChats > 0 && <span style={{ ...countDot, background: "var(--red)", color: "#fff" }}>{unreadChats > 9 ? "9+" : unreadChats}</span>}
              </Link>
            )}
          </span>
        </div>
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
        <div style={{ padding: "8px 16px 0" }}>
          <SmartSearch value={search} onChange={setSearch} initialText={initialQ} />
        </div>
      </div>

      <div className="body feed-body" style={{ padding: "4px 16px 24px", gap: 0 }}>
        <div className="feed-col">
        <ContinueHosting style={{ marginTop: 14 }} />
        <MyWantCard style={{ marginTop: 14 }} invite={few} />
        <InstallCard style={{ marginTop: 14 }} />
        {inCamp && (
          <div className="row card" style={{ marginTop: 14, padding: "12px 14px", borderRadius: 18 }}>
            <span className="tile t-amber"><Video size={20} strokeWidth={2.2} /></span>
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>View by video call from camp. Free switch once you get your PPA.</span>
          </div>
        )}
        {ranked == null && !error && <span className="lbl" style={{ display: "block", padding: "12px 2px" }}>Finding bunkies…</span>}
        {ranked != null && hidden > 0 && (
          <Link href="/start" className="row card" style={{ marginTop: 14, padding: "12px 14px", borderRadius: 18, color: "var(--ink)", gap: 12 }}>
            <span className="tile t-lilac"><Users size={20} /></span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
              {hidden} {hidden === 1 ? "home" : "homes"} hidden because you chose {prefs.pref === "women_only" ? "women only" : "men only"}
            </span>
            <span className="link" style={{ height: "auto" }}>Change</span>
          </Link>
        )}
        {exact && exact.length > 0 && (
          <span className="lbl" style={{ display: "block", padding: "12px 2px" }}>
            {exact.length} {exact.length === 1 ? "bunkie" : "bunkies"} {inCamp ? "free on your camp exit day" : search?.place ? `near ${search.place.label}` : prefs.ppa ? "near your PPA" : "in Abuja"}
          </span>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        {ranked == null && !error && <Skeletons />}
        {exact && exact.length > 0 && (
          <div className="rise stack roomgrid" style={{ gap: 16 }}>
            {exact.map(({ r, fit }) => (
              <RoomCard key={r.id} room={r} saved={saved.has(r.id)} onToggleSave={() => toggleSave(r.id)} fitScore={fit}
                minutesLabel={inCamp ? (r.ease_min != null ? `${r.ease_min} min to centre` : null) : r.commute_min != null ? `${r.commute_min} min` : null} />
            ))}
          </div>
        )}
        {close.length > 0 && (
          <div className="rise stack roomgrid" style={{ gap: 16, paddingTop: exact?.length ? 24 : 0 }}>
            <span className="stack" style={{ gap: 2, padding: "12px 2px 0" }}>
              <span className="h2">{exact?.length ? "Close matches" : "Nothing exact yet. These are close"}</span>
              <span className="small">Each one says what&apos;s different.</span>
            </span>
            {close.map(({ r, fit }) => (
              <RoomCard key={r.id} room={r} saved={saved.has(r.id)} onToggleSave={() => toggleSave(r.id)} fitScore={fit}
                minutesLabel={inCamp ? (r.ease_min != null ? `${r.ease_min} min to centre` : null) : r.commute_min != null ? `${r.commute_min} min` : null} />
            ))}
          </div>
        )}
        {ranked && ranked.length === 0 && (
          <div className="stack" style={{ padding: "32px 8px", alignItems: "center", textAlign: "center", gap: 12 }}>
            <span className="h2">No bunkies match yet</span>
            {/* Say what's narrowing the search, so a hidden listing never looks like a missing one. */}
            <div className="lrows" style={{ width: "100%", textAlign: "left" }}>
              {inCamp && (
                <Link className="lrow" href="/start"><span className="tile t-amber"><Tent size={20} /></span>
                  <span className="stack" style={{ gap: 0, flex: 1 }}><span>Open to camp bookings</span><span className="small">Free on {batch ? dayLabel(batch.campEnd) : "your camp exit day"}</span></span>
                  <span className="link" style={{ height: "auto" }}>Change</span></Link>
              )}
              {(prefs.pref === "women_only" || prefs.pref === "men_only") && (
                <Link className="lrow" href="/start"><span className="tile t-lilac"><Users size={20} /></span>
                  <span style={{ flex: 1 }}>{prefs.pref === "women_only" ? "Women-only homes" : "Men-only homes"}</span>
                  <span className="link" style={{ height: "auto" }}>Change</span></Link>
              )}
              <button className="lrow" onClick={() => setShowFilters(true)}><span className="tile t-mint"><SlidersHorizontal size={20} /></span>
                <span style={{ flex: 1 }}>{nFilters > 0 ? `${nFilters} ${nFilters === 1 ? "filter" : "filters"} on` : "Price, stay and room"}</span>
                <span className="link" style={{ height: "auto" }}>Change</span></button>
            </div>
          </div>
        )}
        {few && <LookingStrip style={{ marginTop: 28 }} />}
        </div>
      </div>
      {/* Laptop: the right-hand panel beside the band and feed (hidden on phones). */}
      <HomeRail />

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
