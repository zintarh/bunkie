"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Megaphone, Users } from "lucide-react";
import { useMe } from "@/lib/auth";
import { loadDraft, type RequestDraft } from "@/lib/draft";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mine = { area_label: string; matches: number; offers: number };

/**
 * Home: your open "what I need" post, with matches and offers so far. Without one, `invite` (few rooms
 * match) shows a prominent card to post one; otherwise it renders nothing.
 */
export function MyWantCard({ style, invite }: { style?: React.CSSProperties; invite?: boolean }) {
  const [me, meLoading] = useMe();
  const [mine, setMine] = useState<Mine | null | undefined>(undefined);
  useEffect(() => {
    if (!me) return;
    supabaseBrowser()?.rpc("my_want").then(({ data }) => setMine(((data as Mine[]) ?? [])[0] ?? null));
  }, [me]);
  // Wait until we know whether there's a post, so the invite never flashes before it.
  const known = !meLoading && (!me || mine !== undefined);
  if (!mine) return invite && known ? <PostWantHero style={style} /> : null;
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

/** Home when few rooms match: posting what you need is the main action. */
function PostWantHero({ style }: { style?: React.CSSProperties }) {
  return (
    <Link href="/want" className="card stack" style={{ gap: 14, padding: 18, color: "var(--ink)", background: "var(--green-soft)", boxShadow: "none", ...style }}>
      <span className="row" style={{ gap: 12 }}>
        <span className="tile t-mint" style={{ background: "#fff" }}><Megaphone size={20} /></span>
        <span className="stack" style={{ gap: 2, flex: 1 }}>
          <b style={{ fontSize: 17 }}>Post what you need</b>
          <span className="small">Area, budget and move-in date. Hosts reach out to you.</span>
        </span>
      </span>
      <span className="btn" style={{ height: 48 }}>Post what you need</span>
    </Link>
  );
}

type Looking = { id: string; first_name: string; batch_label: string | null; area_label: string; budget_max: number | null; mine: boolean };

/** Home when few rooms match: corpers already looking, so anyone with a room can offer it. Signed in only. */
export function LookingStrip({ style }: { style?: React.CSSProperties }) {
  const [me] = useMe();
  const [rows, setRows] = useState<Looking[] | null>(null);
  useEffect(() => {
    if (!me) return;
    supabaseBrowser()?.rpc("want_feed", { p_listing: null, p_limit: 20 })
      .then(({ data }) => setRows(((data ?? []) as Looking[]).filter((w) => !w.mine)));
  }, [me]);
  if (!rows?.length) return null;
  return (
    <section className="stack" style={{ gap: 10, ...style }}>
      <span className="between" style={{ padding: "0 2px" }}>
        <span className="h2">Corpers looking</span>
        <Link href="/host/looking" className="link" style={{ height: "auto" }}>See all {rows.length}</Link>
      </span>
      {rows.slice(0, 3).map((w) => (
        <Link key={w.id} href="/host/looking" className="card row" style={{ gap: 12, padding: "12px 14px", color: "var(--ink)" }}>
          <span className="avatar" style={{ width: 40, height: 40, fontSize: 16 }}>{w.first_name.slice(0, 1).toUpperCase()}</span>
          <span className="stack" style={{ gap: 0, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 15 }}><b>{w.first_name}</b> needs a room in <b>{w.area_label}</b></span>
            <span className="small">{[w.batch_label, w.budget_max ? `Under ₦${Math.round(w.budget_max / 1000)}k` : null].filter(Boolean).join(" · ") || "Abuja"}</span>
          </span>
          <ChevronRight size={18} color="var(--muted)" />
        </Link>
      ))}
      <Link href="/host" className="small" style={{ padding: "2px 2px 0", fontWeight: 700, color: "var(--green-text)" }}>Have a room? Offer it</Link>
    </section>
  );
}

/** Hosting: how many corpers are looking right now. */
export function LookingCard({ style }: { style?: React.CSSProperties }) {
  const [me] = useMe();
  const [n, setN] = useState<number | null>(null);
  // Only signed-in people can see who's looking.
  useEffect(() => {
    if (!me) return;
    supabaseBrowser()?.rpc("want_feed", { p_listing: null, p_limit: 100 })
      .then(({ data }) => setN(((data ?? []) as { mine: boolean }[]).filter((w) => !w.mine).length));
  }, [me]);
  if (!n) return null;
  return (
    <Link href="/host/looking" className="card row" style={{ gap: 12, padding: "12px 14px", color: "var(--ink)", ...style }}>
      <span className="tile t-sky"><Users size={20} /></span>
      <span style={{ flex: 1, fontWeight: 700 }}>{n} {n === 1 ? "corper is" : "corpers are"} looking for a room</span>
      <ChevronRight size={18} color="var(--muted)" />
    </Link>
  );
}

/** Home: a request saved while their account was under review, ready to send now they're verified. */
export function SavedRequestCard({ style }: { style?: React.CSSProperties }) {
  const [me] = useMe();
  const [draft, setDraft] = useState<RequestDraft | null>(null);
  useEffect(() => setDraft(loadDraft()), []);
  if (!me?.profile.is_verified || !draft) return null;
  return (
    <Link href={`/request/${draft.listingId}/send`} className="card row" style={{ gap: 12, padding: 14, color: "var(--ink)", background: "var(--green-soft)", boxShadow: "none", ...style }}>
      <span className="tile t-mint" style={{ background: "#fff" }}><Megaphone size={20} /></span>
      <span className="stack" style={{ gap: 0, flex: 1, minWidth: 0 }}>
        <b>Send your request to {draft.hostName}</b>
        <span className="small">You&apos;re verified. It&apos;s ready to go.</span>
      </span>
      <ChevronRight size={18} color="var(--muted)" />
    </Link>
  );
}
