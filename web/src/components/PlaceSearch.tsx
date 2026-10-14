"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MapPin, Search, X } from "lucide-react";

export type Place = { label: string; area: string; address: string; lat: number; lng: number };
type Suggestion = { id: string; main: string; secondary: string };

const newSession = () => crypto.randomUUID();

/** Turns the phone's location into an address and area. Throws "outside" when it isn't in Abuja. */
export async function placeAt(lat: number, lng: number): Promise<Place | null> {
  const res = await fetch(`/api/places/reverse?lat=${lat}&lng=${lng}`).catch(() => null);
  if (res?.status === 422) throw new Error("outside");
  if (!res?.ok) return null;
  return (await res.json()).place;
}

/**
 * Google Places search limited to Abuja. Shows `idle` while the box is empty, and
 * `fallback(query)` instead of results when Google isn't set up on this server.
 */
export function PlaceSearch({ placeholder, onPick, idle, fallback, autoFocus }: {
  placeholder: string;
  onPick: (p: Place) => void;
  idle?: ReactNode;
  fallback?: (q: string) => ReactNode;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [google, setGoogle] = useState<boolean | null>(null);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useRef(newSession());
  const s = q.trim();

  useEffect(() => {
    if (google === false || s.length < 2) {
      setResults([]);
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
        setResults(data.results);
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
  }, [s, google]);

  const pick = async (r: Suggestion) => {
    setPicking(r.id);
    setError(null);
    try {
      const res = await fetch(`/api/places/details?id=${encodeURIComponent(r.id)}&session=${session.current}`);
      const data = await res.json();
      if (!res.ok) throw new Error();
      session.current = newSession();
      setQ("");
      setResults([]);
      onPick({ ...data.place, label: r.main });
    } catch {
      setError("Couldn't open that place. Try again.");
    } finally {
      setPicking(null);
    }
  };

  return (
    <div className="stack" style={{ gap: 0 }}>
      <label className="field">
        <Search size={20} color="var(--muted)" strokeWidth={2.2} />
        <span className="sr-only">{placeholder}</span>
        <input placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} autoComplete="off" />
        {searching ? <span className="spin dark" aria-label="Searching" /> : q && <button type="button" className="ib" onClick={() => setQ("")} aria-label="Clear search"><X size={18} /></button>}
      </label>
      {!s && idle}
      {error && <p className="err" style={{ padding: "12px 0 0" }}>{error}</p>}
      {google === false && fallback ? fallback(s) : (
        <>
          {results.map((r) => (
            <button type="button" key={r.id} className="lrow" onClick={() => pick(r)} disabled={!!picking} style={{ padding: "10px 0" }}>
              <span className="tile" style={{ background: "#F1F4EF" }}>{picking === r.id ? <span className="spin dark" /> : <MapPin size={18} strokeWidth={2.2} />}</span>
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{r.main}</span>
                {r.secondary && <span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.secondary}</span>}
              </span>
            </button>
          ))}
          {s.length >= 2 && !searching && !error && google && results.length === 0 && (
            <p className="small" style={{ padding: "20px 0" }}>Nothing found in Abuja. Try a street or nearby landmark.</p>
          )}
        </>
      )}
    </div>
  );
}
