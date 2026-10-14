"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, House } from "lucide-react";
import { Progress } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { draftLabel, draftProgress, resumeHref } from "@/lib/hosting";
import { photoUrl } from "@/lib/photos";
import { supabaseBrowser } from "@/lib/supabase/client";

type Draft = { id: string; draft_step: number; area_name: string; cover_path: string | null };

/** The host's most recent unfinished listing, with progress and a way back in. Renders nothing otherwise. */
export function ContinueHosting({ style }: { style?: React.CSSProperties }) {
  const [me] = useMe();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    const db = supabaseBrowser();
    if (!me || !db) return setDraft(null);
    db.from("listings").select("id, draft_step, area_name, cover_path").eq("host_id", me.user.id).eq("status", "draft")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setDraft(data as Draft | null));
  }, [me]);

  if (!draft) return null;
  return (
    <Link href={resumeHref(draft)} className="card stack" style={{ gap: 12, padding: 14, color: "var(--ink)", ...style }}>
      <span className="row" style={{ gap: 12 }}>
        {draft.cover_path
          ? <span className="photo" style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, backgroundImage: `url(${photoUrl(draft.cover_path)})` }} />
          : <span className="tile t-mint" style={{ flexShrink: 0 }}><House size={20} /></span>}
        <span className="stack" style={{ gap: 0, flex: 1, minWidth: 0 }}>
          <b>Finish your listing{draft.area_name ? ` in ${draft.area_name}` : ""}</b>
          <span className="small">{draftLabel(draft)}</span>
        </span>
        <ChevronRight size={20} color="var(--muted)" />
      </span>
      <span style={{ borderRadius: 999, overflow: "hidden", display: "flex" }}><Progress value={Math.max(0.04, draftProgress(draft))} /></span>
    </Link>
  );
}
