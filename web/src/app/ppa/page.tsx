"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import { TopBar } from "@/components/ui";
import { ZONES, nearestZone } from "@/lib/places";
import { setPrefs } from "@/lib/prefs";

type Suggestion = { id: string; main: string; secondary: string };
type Place = { label: string; lat: number; lng: number };

const newSession = () => crypto.randomUUID();

export default function PpaSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  // null until we know; false when Google isn't set up, so the built-in areas are used.
  const [google, setGoogle] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useRef(newSession());

  const areas = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? ZONES.filter((z) => z.name.toLowerCase().includes(s)) : ZONES;
  }, [q]);

  useEffect(() => {
    const s = q.trim();
    if (google === false || s.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(s)}&session=${session.current}`, { signal: ctrl.signal });
        if (res.status === 501) return setGoogle(false);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setGoogle(true);
        setError(null);
        setSuggestions(data.results);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error && e.message ? e.message : "Search isn't working right now. Try again.");
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, google]);

  const choose = ({ label, lat, lng }: Place) => {
    setPrefs({ ppa: { label, lat, lng, zoneId: nearestZone(lat, lng).id } });
    router.push("/explore");
  };

  const pick = async (s: Suggestion) => {
    setPicking(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/places/details?id=${encodeURIComponent(s.id)}&session=${session.current}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      session.current = newSession();
      choose({ ...data.place, label: s.main });
    } catch {
      setPicking(null);
      setError("Couldn't open that place. Try again.");
    }
  };

  const useLocation = () => {
    if (!navigator.geolocation) return setError("Location isn't available on this phone. Search instead.");
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res = await fetch(`/api/places/reverse?lat=${lat}&lng=${lng}`);
          if (res.status === 422) {
            setLocating(false);
            return setError("You're outside Abuja. Search for your PPA instead.");
          }
          const data = await res.json();
          if (!res.ok) throw new Error();
          choose(data.place);
        } catch {
          choose({ label: `Near ${nearestZone(lat, lng).name}`, lat, lng });
        }
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Search instead.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const showAreas = google === false || !q.trim();

  return (
    <main className="screen">
      <TopBar back="/start" />
      <div style={{ padding: "4px 20px 12px", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 className="h1">Where&apos;s your PPA?</h1>
        <label className="field">
          <Search size={20} color="var(--muted)" strokeWidth={2.2} />
          <span className="sr-only">Search your PPA</span>
          <input placeholder="Search your PPA or area" value={q} onChange={(e) => setQ(e.target.value)} autoFocus autoComplete="off" />
          {searching ? <span className="spin dark" aria-label="Searching" /> : q && <button className="ib" onClick={() => setQ("")} aria-label="Clear search"><X size={18} /></button>}
        </label>
      </div>
      <div className="body" style={{ gap: 0, paddingTop: 0 }}>
        {!q && (
          <button className="lrow" onClick={useLocation} disabled={locating}>
            <span className="tile t-mint"><LocateFixed size={20} strokeWidth={2.2} /></span>
            <span style={{ fontWeight: 600 }}>{locating ? "Finding you…" : "Use my current location"}</span>
          </button>
        )}
        {error && <p className="err" style={{ padding: "12px 0" }}>{error}</p>}

        {google !== false && suggestions.map((s) => (
          <button key={s.id} className="lrow" onClick={() => pick(s)} disabled={!!picking} style={{ padding: "10px 0" }}>
            <span className="tile" style={{ background: "#F1F4EF" }}>{picking === s.id ? <span className="spin dark" /> : <MapPin size={18} strokeWidth={2.2} />}</span>
            <span className="stack" style={{ gap: 0, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{s.main}</span>
              {s.secondary && <span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.secondary}</span>}
            </span>
          </button>
        ))}
        {google !== false && q.trim().length >= 2 && !searching && !error && suggestions.length === 0 && (
          <p className="small" style={{ padding: "20px 0" }}>No places found in Abuja. Try your office name or street.</p>
        )}

        {showAreas && (
          <>
            {!q && <span className="lbl" style={{ padding: "18px 2px 6px" }}>Areas in Abuja</span>}
            {areas.map((z) => (
              <button key={z.id} className="lrow" onClick={() => choose({ label: z.name, lat: z.lat, lng: z.lng })}>
                <span className="tile" style={{ background: "#F1F4EF" }}><MapPin size={18} strokeWidth={2.2} /></span>
                <span style={{ fontWeight: 600 }}>{z.name}</span>
              </button>
            ))}
            {q && areas.length === 0 && <p className="small" style={{ padding: "20px 0" }}>No areas found. Try a nearby district.</p>}
          </>
        )}
      </div>
      <div className="foot" style={{ boxShadow: "none", alignItems: "center" }}>
        <button className="link" onClick={() => { setPrefs({ ppa: null }); router.push("/explore"); }}>Skip for now</button>
      </div>
    </main>
  );
}
