"use client";
import { useEffect, useState } from "react";

/**
 * True on phones and tablets, where location comes from GPS. Laptops guess from Wi-Fi or IP,
 * often kilometres off, so location buttons are hidden there. null until known (first render).
 */
export function useHasGps(): boolean | null {
  const [gps, setGps] = useState<boolean | null>(null);
  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0;
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac
    setGps(touch && mobileUa && "geolocation" in navigator);
  }, []);
  return gps;
}
