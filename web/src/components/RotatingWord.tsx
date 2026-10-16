"use client";
import { useEffect, useState } from "react";

/** Cycles through words in place (Pinterest-style). All words share one grid cell so the line never jumps. */
export function RotatingWord({ words, className, every = 2600 }: { words: string[]; className?: string; every?: number }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % words.length), every);
    return () => clearInterval(t);
  }, [words.length, every]);

  return (
    <span className={className} aria-hidden="true">
      {words.map((w, n) => (
        <span key={w} data-on={n === i || undefined}>{w}</span>
      ))}
    </span>
  );
}
