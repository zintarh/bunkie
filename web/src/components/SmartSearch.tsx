"use client";
import { useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { ROOM_LABEL, months, nairaK, weeks } from "@/lib/format";
import type { SearchIntent } from "@/lib/types";

type U = SearchIntent["understood"];

/** The understood parts of a search as removable labels. */
function parts(s: SearchIntent): { key: keyof U | "place"; label: string }[] {
  const u = s.understood;
  const out: { key: keyof U | "place"; label: string }[] = [];
  if (s.place) out.push({ key: "place", label: `Near ${s.place.label}` });
  if (u.budgetMax) out.push({ key: "budgetMax", label: `Under ${nairaK(u.budgetMax)}` });
  if (u.room) out.push({ key: "room", label: ROOM_LABEL[u.room] });
  if (u.ownBath) out.push({ key: "ownBath", label: "Own bathroom" });
  if (u.furnished) out.push({ key: "furnished", label: "Furnished" });
  if (u.weeks) out.push({ key: "weeks", label: weeks(u.weeks) });
  else if (u.months) out.push({ key: "months", label: months(u.months) });
  else if (u.stay) out.push({ key: "stay", label: u.stay === "weeks" ? "1–4 weeks" : u.stay === "short" ? "1–3 months" : "6–12 months" });
  if (u.pref) out.push({ key: "pref", label: u.pref === "women_only" ? "Women only" : "Men only" });
  if (u.maxMinutes) out.push({ key: "maxMinutes", label: `Within ${u.maxMinutes} min` });
  return out;
}

/** Type what you want ("self con near Utako under 80k"); shows what Bunkie understood. */
export function SmartSearch({ value, onChange }: { value: SearchIntent | null; onChange: (s: SearchIntent | null) => void }) {
  const [text, setText] = useState(value?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const q = text.trim();
    if (q.length < 2) return onChange(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/understand?q=${encodeURIComponent(q.toLowerCase())}`);
      const data = await res.json();
      const s: SearchIntent = { text: q, understood: data.understood ?? {}, place: data.place ?? null };
      if (data.understood?.place && !data.place) setError(`Couldn't find "${data.understood.place}" in Abuja.`);
      if (!parts(s).length && !data.understood?.place) setError("Try an area, a budget or a room type, like “self con near Utako under 80k”.");
      onChange(parts(s).length ? s : null);
    } catch {
      setError("No connection. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = (key: keyof U | "place") => {
    if (!value) return;
    const u = { ...value.understood };
    if (key === "place") delete u.place;
    else {
      delete u[key];
      if (key === "weeks" || key === "months") delete u.stay;
    }
    const next: SearchIntent = { ...value, understood: u, place: key === "place" ? null : value.place };
    onChange(parts(next).length ? next : null);
    if (!parts(next).length) setText("");
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <form className="smart" onSubmit={(e) => { e.preventDefault(); void run(); }} role="search">
        <Sparkles size={18} color="var(--green)" style={{ flexShrink: 0 }} aria-hidden="true" />
        <label htmlFor="smart" className="sr-only">Search rooms</label>
        <input id="smart" value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="search" autoComplete="off"
          placeholder="Try “self con near Utako under 80k”" />
        {value || text
          ? <button type="button" className="ib" aria-label="Clear search" onClick={() => { setText(""); setError(null); onChange(null); }}><X size={18} /></button>
          : null}
        <button type="submit" className="go" aria-label="Search" disabled={busy}>{busy ? <span className="spin" /> : <Search size={18} />}</button>
      </form>
      {value && (
        <div className="chips" style={{ padding: 0 }}>
          {parts(value).map((p) => (
            <button key={p.key} type="button" className="chip on" onClick={() => remove(p.key)} aria-label={`Remove ${p.label}`}>
              {p.label}<X size={14} />
            </button>
          ))}
        </div>
      )}
      {error && <span style={{ fontSize: 13, fontWeight: 600 }}>{error}</span>}
    </div>
  );
}
