"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { RequireAuth, safeNext, syncPrefsToProfile } from "@/components/auth";
import { TopBar } from "@/components/ui";
import { errorText, refreshMe, useMe } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";

function Name() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [me] = useMe();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Google sign-ups arrive with a name already.
    const meta = me?.user.user_metadata ?? {};
    if (meta.given_name && !first) setFirst(meta.given_name);
    if (meta.family_name && !last) setLast(meta.family_name);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const db = supabaseBrowser();
    if (!db || !me) return;
    setBusy(true);
    setError(null);
    const a = await db.from("profiles").update({ first_name: first.trim() }).eq("id", me.user.id);
    const b = await db.from("profile_private").update({ last_name: last.trim() }).eq("user_id", me.user.id);
    await syncPrefsToProfile(me.user.id);
    setBusy(false);
    if (a.error || b.error) return setError(errorText(a.error ?? b.error));
    await refreshMe();
    router.replace(next);
  };

  const ok = first.trim().length > 0 && last.trim().length > 0;
  return (
    <main className="screen">
      <TopBar />
      <div className="body">
        <h1 className="h1">What&apos;s your name?</h1>
        <div className="stack">
          <label className="lbl" htmlFor="first">First name</label>
          <label className="field"><input id="first" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} /></label>
        </div>
        <div className="stack">
          <label className="lbl" htmlFor="last">Last name</label>
          <label className="field"><input id="last" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} /></label>
        </div>
        <p className="small">Use the name on your NIN.</p>
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <div className="foot">
        <button className="btn" disabled={!ok || busy} onClick={save}>{busy ? <span className="spin" /> : "Continue"}</button>
      </div>
    </main>
  );
}

export default function Page() {
  return <Suspense><RequireAuth next="/signup/name"><Name /></RequireAuth></Suspense>;
}
