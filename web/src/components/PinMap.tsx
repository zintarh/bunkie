"use client";
import { useEffect, useRef, useState } from "react";
import { MapImage } from "./MapImage";

/** Browser key for the Maps JavaScript API only, restricted to Bunkie's web addresses. */
const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";
const FCT = { south: 8.35, west: 6.7, north: 9.45, east: 7.65 };

let loading: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window !== "undefined" && window.google?.maps?.Map) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const cb = `__bunkieMaps${Date.now()}`;
    (window as unknown as Record<string, () => void>)[cb] = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&v=weekly&loading=async&callback=${cb}`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error("maps"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * A live Google map with a fixed pin in the middle: drag the map to put the pin on the exact spot.
 * Falls back to a still map image when the browser key isn't set or the map can't load.
 */
export function PinMap({ lat, lng, onMove, height = 240, label }: {
  lat: number; lng: number; onMove: (p: { lat: number; lng: number }) => void; height?: number; label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const [failed, setFailed] = useState(!BROWSER_KEY);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!BROWSER_KEY) return;
    let live = true;
    loadMaps().then(() => {
      if (!live || !box.current || map.current) return;
      const m = new google.maps.Map(box.current, {
        center: { lat, lng },
        zoom: 17,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: "greedy",
        restriction: { latLngBounds: FCT, strictBounds: false },
      });
      m.addListener("dragstart", () => setMoving(true));
      m.addListener("idle", () => {
        setMoving(false);
        const c = m.getCenter();
        if (c) moveRef.current({ lat: c.lat(), lng: c.lng() });
      });
      map.current = m;
    }, () => live && setFailed(true));
    return () => {
      live = false;
    };
    // Only create the map once; later lat/lng changes are handled below.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A new place picked from search moves the map there.
  useEffect(() => {
    const m = map.current;
    const c = m?.getCenter();
    if (m && c && (Math.abs(c.lat() - lat) > 1e-6 || Math.abs(c.lng() - lng) > 1e-6)) m.panTo({ lat, lng });
  }, [lat, lng]);

  if (failed) return <MapImage lat={lat} lng={lng} mode="pin" height={height} label={label} />;
  return (
    <div className="map" style={{ height }} role="application" aria-label={label}>
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      <span className={moving ? "center-pin up" : "center-pin"} aria-hidden="true" />
    </div>
  );
}
