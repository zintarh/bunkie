"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { PlaceSearch, placeAt } from "@/components/PlaceSearch";
import { TopBar } from "@/components/ui";
import { ZONES, nearestZone } from "@/lib/places";
import { useHasGps } from "@/lib/device";
import { setPrefs } from "@/lib/prefs";

export default function PpaSearch() {
  const router = useRouter();
  const gps = useHasGps();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (label: string, lat: number, lng: number) => {
    setPrefs({ ppa: { label, lat, lng, zoneId: nearestZone(lat, lng).id } });
    router.push("/explore");
  };

  const useLocation = () => {
    if (!navigator.geolocation) return setError("Location isn't available on this phone. Search instead.");
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const place = await placeAt(lat, lng);
          choose(place?.label ?? `Near ${nearestZone(lat, lng).name}`, lat, lng);
        } catch {
          setLocating(false);
          setError("You're outside Abuja. Search for your PPA instead.");
        }
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Search instead.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const areaRows = (q: string) => {
    const list = q ? ZONES.filter((z) => z.name.toLowerCase().includes(q.toLowerCase())) : ZONES;
    return (
      <>
        {!q && <span className="lbl" style={{ padding: "18px 2px 6px" }}>Areas in Abuja</span>}
        {list.map((z) => (
          <button key={z.id} className="lrow" onClick={() => choose(z.name, z.lat, z.lng)}>
            <span className="tile" style={{ background: "#F1F4EF" }}><MapPin size={18} strokeWidth={2.2} /></span>
            <span style={{ fontWeight: 600 }}>{z.name}</span>
          </button>
        ))}
        {q && list.length === 0 && <p className="small" style={{ padding: "20px 0" }}>No areas found. Try a nearby district.</p>}
      </>
    );
  };

  return (
    <main className="screen">
      <TopBar back="/start" />
      <div className="body" style={{ gap: 16, paddingTop: 4 }}>
        <h1 className="h1">Where&apos;s your PPA?</h1>
        <PlaceSearch
          placeholder="Search your PPA or area"
          autoFocus
          onPick={(p) => choose(p.label, p.lat, p.lng)}
          fallback={areaRows}
          idle={
            <>
              {gps && (
                <button className="lrow" onClick={useLocation} disabled={locating} style={{ marginTop: 8 }}>
                  <span className="tile t-mint"><LocateFixed size={20} strokeWidth={2.2} /></span>
                  <span style={{ fontWeight: 600 }}>{locating ? "Finding you…" : "Use my current location"}</span>
                </button>
              )}
              {error && <p className="err" style={{ padding: "12px 0" }}>{error}</p>}
            </>
          }
        />
      </div>
      <div className="foot" style={{ boxShadow: "none", alignItems: "center" }}>
        <button className="link" onClick={() => { setPrefs({ ppa: null }); router.push("/explore"); }}>Skip for now</button>
      </div>
    </main>
  );
}
