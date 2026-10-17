"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Megaphone, Users } from "lucide-react";
import { useMe } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mine = { area_label: string; matches: number; offers: number };

/** Home: your open "what I need" post, with matches and offers so far. Renders nothing without one. */
export function MyWantCard({ style }: { style?: React.CSSProperties }) {
  const [me] = useMe();
  const [mine, setMine] = useState<Mine | null>(null);
  useEffect(() => {
    if (!me) return;
    supabaseBrowser()?.rpc("my_want").then(({ data }) => setMine(((data as Mine[]) ?? [])[0] ?? null));
  }, [me]);
  if (!mine) return null;
  return (
    <Link href="/want" className="card row" style={{ gap: 12, padding: 14, color: "var(--ink)", ...style }}>
      <span className="tile t-amber"><Megaphone size={20} /></span>
      <span className="stack" style={{ gap: 0, flex: 1, minWidth: 0 }}>
        <b>You&apos;re looking in {mine.area_label}</b>
        <span className="small">{mine.matches} {mine.matches === 1 ? "room matches" : "rooms match"} · {mine.offers} {mine.offers === 1 ? "offer" : "offers"}</span>
      </span>
      <ChevronRight size={18} color="var(--muted)" />
    </Link>
  );
}

/** "Can't find it? Post what you need" (Home empty state, close matches, the laptop side panel). */
export function PostWantLink({ style }: { style?: React.CSSProperties }) {
  return (
    <Link href="/want" className="row card" style={{ gap: 12, padding: "12px 14px", color: "var(--ink)", ...style }}>
      <span className="tile t-mint"><Megaphone size={20} /></span>
      <span className="stack" style={{ gap: 0, flex: 1 }}>
        <b style={{ fontSize: 15 }}>Can&apos;t find it?</b>
        <span className="small">Post what you need and let hosts come to you.</span>
      </span>
      <ChevronRight size={18} color="var(--muted)" />
    </Link>
  );
}

/** Hosting: how many corpers are looking right now. */
export function LookingCard({ style }: { style?: React.CSSProperties }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    supabaseBrowser()?.rpc("want_feed", { p_listing: null, p_limit: 100 })
      .then(({ data }) => setN(((data ?? []) as { mine: boolean }[]).filter((w) => !w.mine).length));
  }, []);
  if (!n) return null;
  return (
    <Link href="/host/looking" className="card row" style={{ gap: 12, padding: "12px 14px", color: "var(--ink)", ...style }}>
      <span className="tile t-sky"><Users size={20} /></span>
      <span style={{ flex: 1, fontWeight: 700 }}>{n} {n === 1 ? "corper is" : "corpers are"} looking for a room</span>
      <ChevronRight size={18} color="var(--muted)" />
    </Link>
  );
}
