"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, CalendarDays, MessageSquare } from "lucide-react";
import { RequireAuth } from "@/components/auth";
import { TopBar } from "@/components/ui";
import { errorText, refreshMe, useMe } from "@/lib/auth";
import { clearDraft, loadDraft, type RequestDraft } from "@/lib/draft";
import { addMonths, dayLabel, parseDay, stayLength } from "@/lib/format";
import { nudge } from "@/lib/install";
import { supabaseBrowser } from "@/lib/supabase/client";
import { qs } from "@/lib/url";

/**
 * Last stop before a request goes out. Sends the person through whatever is still missing
 * (bunkie questions, then verification) and always returns here with the draft intact.
 */
function Send() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [me] = useMe();
  const [draft, setDraft] = useState<RequestDraft | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = `/request/${id}/send`;

  useEffect(() => {
    const d = loadDraft(id);
    if (!d) return router.replace(`/request/${id}`);
    setDraft(d);
  }, [id, router]);

  useEffect(() => {
    const db = supabaseBrowser();
    if (!db || !me || !draft) return;
    (async () => {
      const { data: answers } = await db.from("bunkie_answers").select("approved_at").eq("user_id", me.user.id).maybeSingle();
      if (!answers?.approved_at) return router.replace(`/questions?next=${qs(here)}`);
      const fresh = await refreshMe();
      // Testing mode (settings.require_verification_to_request = false) skips ID checks.
      const { data: rule } = await db.from("settings").select("value").eq("key", "require_verification_to_request").maybeSingle();
      const mustVerify = rule?.value !== false;
      if (mustVerify && !fresh?.profile.is_verified) return router.replace(`/verify?next=${qs(here)}`);
      setChecking(false);
    })();
  }, [me, draft, here, router]);

  const send = async () => {
    const db = supabaseBrowser();
    if (!db || !draft) return;
    setBusy(true);
    setError(null);
    const { data, error } = await db.rpc("request_room", {
      p_listing: draft.listingId, p_move_in: draft.moveIn, p_months: draft.weeks ? null : draft.months, p_weeks: draft.weeks ?? null, p_message: draft.message || null,
    });
    setBusy(false);
    if (error) return setError(errorText(error));
    clearDraft();
    nudge("request", draft.hostName);
    router.replace(`/bookings/${(data as { id: string }).id}?sent=1`);
  };

  if (!draft || checking) {
    return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><span className="spin dark" aria-label="Loading" /></main>;
  }
  const end = draft.weeks ? parseDay(draft.moveIn) : addMonths(parseDay(draft.moveIn), draft.months);
  end.setDate(end.getDate() + (draft.weeks ? 7 * draft.weeks : 0) - 1);

  return (
    <main className="screen">
      <TopBar back={`/request/${id}`} />
      <div className="body">
        <h1 className="h1">Send request to {draft.hostName}</h1>
        <div className="lrows">
          <div className="lrow"><span className="tile t-mint"><CalendarDays size={20} /></span>
            <span className="stack" style={{ gap: 0 }}><span style={{ fontWeight: 700 }}>{dayLabel(draft.moveIn)} – {dayLabel(end, true)}</span><span className="small">{stayLength({ months: draft.months, weeks: draft.weeks })}</span></span>
          </div>
          <div className="lrow"><span className="tile t-amber"><BadgeCheck size={20} /></span><span>Verified, with your bunkie profile</span></div>
          {draft.message && <div className="lrow"><span className="tile t-sky"><MessageSquare size={20} /></span><span style={{ fontSize: 15 }}>{draft.message}</span></div>}
        </div>
        <p className="note">Hosts see: your name, photo and a verified badge. Never: your NIN, documents or phone number. Delete your data any time.</p>
        {error && (
          <div className="stack">
            <p className="err" role="alert">{error}</p>
            <Link className="link" href="/explore" style={{ alignSelf: "flex-start" }}>See other rooms</Link>
          </div>
        )}
      </div>
      <div className="foot">
        <button className="btn" disabled={busy} onClick={send}>{busy ? <span className="spin" /> : `Send request to ${draft.hostName}`}</button>
        <span className="small" style={{ textAlign: "center" }}>You won&apos;t pay anything now</span>
      </div>
    </main>
  );
}

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <RequireAuth next={`/request/${id}/send`}><Send /></RequireAuth>;
}
