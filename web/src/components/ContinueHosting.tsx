"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { House, X } from "lucide-react";
import { Progress } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { LISTING_PROGRESS, draftLabel, draftProgress, resumeHref, stepsDone, type ProgressFields } from "@/lib/hosting";
import { photoUrl } from "@/lib/photos";
import { supabaseBrowser } from "@/lib/supabase/client";

type Draft = ProgressFields & { area_name: string; cover_path: string | null };

// Drafts closed with the ✕ stay hidden on this phone (the draft itself is kept).
const KEY = "bunkie.hiddenDrafts.v1";
const hidden = (): string[] => {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};

/**
 * The host's most recent unfinished listing, with progress and a way back in. Shown only once a step
 * has been filled in (just tapping Start doesn't count), and it can be closed. Renders nothing otherwise.
 */
export function ContinueHosting({ style }: { style?: React.CSSProperties }) {
  const [me] = useMe();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    const db = supabaseBrowser();
    if (!me || !db) return setDraft(null);
    db.from("listings").select(`area_name, cover_path, ${LISTING_PROGRESS}`).eq("host_id", me.user.id).eq("status", "draft")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        const d = data as unknown as Draft | null;
        setDraft(d && stepsDone(d).size > 0 && !hidden().includes(d.id) ? d : null);
      });
  }, [me]);

  if (!draft) return null;
  const close = () => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...hidden(), draft.id].slice(-20)));
    } catch {
      // Storage blocked: it just hides for now.
    }
    setDraft(null);
  };

  return (
    <div className="card stack" style={{ gap: 12, padding: 14, position: "relative", ...style }}>
      <Link href={resumeHref(draft)} className="stack" style={{ gap: 12, color: "var(--ink)" }}>
        <span className="row" style={{ gap: 12, paddingRight: 36 }}>
          {draft.cover_path
            ? <span className="photo" style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0, backgroundImage: `url(${photoUrl(draft.cover_path)})` }} />
            : <span className="tile t-mint" style={{ flexShrink: 0 }}><House size={20} /></span>}
          <span className="stack" style={{ gap: 0, flex: 1, minWidth: 0 }}>
            <b>Finish your listing{draft.area_name ? ` in ${draft.area_name}` : ""}</b>
            <span className="small">{draftLabel(draft)}</span>
          </span>
        </span>
        <span style={{ borderRadius: 999, overflow: "hidden", display: "flex" }}><Progress value={Math.max(0.04, draftProgress(draft))} /></span>
      </Link>
      <button className="ib" onClick={close} aria-label="Hide this" style={{ position: "absolute", right: 6, top: 6, width: 36, height: 36 }}>
        <X size={18} color="var(--muted)" />
      </button>
    </div>
  );
}
