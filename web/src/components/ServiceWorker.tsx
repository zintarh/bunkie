"use client";
import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    // Registered in dev too, for notifications; sw.js skips caching on localhost.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Not fatal: the app works without offline support.
      });
    }
  }, []);
  return null;
}
