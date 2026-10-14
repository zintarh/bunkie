"use client";
import { useState } from "react";

/**
 * A Google map of a spot. "pin" marks the exact point (shown only to people allowed to see it);
 * "area" shows a circle around an already-blurred point, for public listing pages.
 */
export function MapImage({ lat, lng, mode, zoom = mode === "pin" ? 16 : 15, height = 160, label }: {
  lat: number; lng: number; mode: "pin" | "area"; zoom?: number; height?: number; label: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = `/api/places/map?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&zoom=${zoom}${mode === "pin" ? "&pin=1" : ""}`;
  return (
    <div className="map" style={{ height }} role="img" aria-label={label}>
      {failed ? (
        <><span className="road-h" /><span className="road-v" /><span className="road-v2" />{mode === "pin" && <span className="dot" />}</>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      )}
      {mode === "area" && <span className="ring" />}
    </div>
  );
}
