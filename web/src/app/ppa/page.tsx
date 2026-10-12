"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LocateFixed, MapPin, Search, X } from "lucide-react";
import { TopBar } from "@/components/ui";
import { ZONES, nearestZone } from "@/lib/places";
import { setPrefs } from "@/lib/prefs";

export default function PpaSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return ZONES.filter((z) => z.name.toLowerCase().includes(s));
  }, [q]);

  const choose = (label: string, lat: number, lng: number) => {
    const z = nearestZone(lat, lng);
    setPrefs({ ppa: { label, lat, lng, zoneId: z.id } });
    router.push("/explore");
  };

  const useLocation = () => {
    if (!navigator.geolocation) return setError("Location isn't available on this phone. Search instead.");
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        choose(`Near ${nearestZone(lat, lng).name}`, lat, lng);
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Search instead.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  return (
    <main className="screen">
      <TopBar back="/start" />
      <div style={{ padding: "4px 20px 12px", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 className="h1">Where&apos;s your PPA?</h1>
        <label className="field">
          <Search size={20} color="var(--muted)" strokeWidth={2.2} />
          <span className="sr-only">Search your PPA</span>
          <input placeholder="Search area, e.g. Wuse, Garki, Kubwa" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {q && <button className="ib" onClick={() => setQ("")} aria-label="Clear search"><X size={18} /></button>}
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
        {!q && <span className="lbl" style={{ padding: "18px 2px 6px" }}>Areas in Abuja</span>}
        {(q ? results : ZONES).map((z) => (
          <button key={z.id} className="lrow" onClick={() => choose(z.name, z.lat, z.lng)}>
            <span className="tile" style={{ background: "#F1F4EF" }}><MapPin size={18} strokeWidth={2.2} /></span>
            <span style={{ fontWeight: 600 }}>{z.name}</span>
          </button>
        ))}
        {q && results.length === 0 && <p className="small" style={{ padding: "20px 0" }}>No areas found. Try a nearby district.</p>}
      </div>
      <div className="foot" style={{ boxShadow: "none", alignItems: "center" }}>
        <button className="link" onClick={() => { setPrefs({ ppa: null }); router.push("/explore"); }}>Skip for now</button>
      </div>
    </main>
  );
}
