"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { saveAvatar } from "@/components/AvatarPicker";
import { RequireAuth, safeNext, syncPrefsToProfile } from "@/components/auth";
import { TopBar } from "@/components/ui";
import { errorText, refreshMe, useMe } from "@/lib/auth";
import { PhotoError } from "@/lib/image";
import { supabaseBrowser } from "@/lib/supabase/client";

function Name() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [me] = useMe();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  // Optional photo: chosen here, uploaded on Continue.
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
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
    if (a.error || b.error) {
      setBusy(false);
      return setError(errorText(a.error ?? b.error));
    }
    if (photo) {
      try {
        await saveAvatar(me.user.id, photo.file);
      } catch (e) {
        setBusy(false);
        return setError(e instanceof PhotoError ? `${e.message} Or remove it for now.` : "Couldn’t save your photo. Try again, or remove it for now.");
      }
    }
    setBusy(false);
    await refreshMe();
    router.replace(next);
  };

  const ok = first.trim().length > 0 && last.trim().length > 0;
  return (
    <main className="screen">
      <TopBar />
      <div className="body">
        <h1 className="h1">What&apos;s your name?</h1>
        <div className="stack" style={{ alignItems: "center", gap: 8 }}>
          <label className="avatar-pick" style={{ width: 96, height: 96 }} aria-label={photo ? "Change your photo" : "Add a photo"}>
            <span className="avatar" style={{ width: 96, height: 96, background: "var(--soft)", color: "var(--muted)" }}>
              {photo ? <img src={photo.url} alt="" /> : <Camera size={30} strokeWidth={2} />}
            </span>
            <input type="file" accept="image/*" className="sr-only" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto({ file: f, url: URL.createObjectURL(f) }); e.target.value = ""; }} />
          </label>
          {photo
            ? <button className="link" style={{ height: "auto" }} onClick={() => setPhoto(null)} disabled={busy}>Remove photo</button>
            : <span className="small">Add a photo. Khaki looks good on you.</span>}
        </div>
        <div className="stack">
          <label className="lbl" htmlFor="first">First name</label>
          <label className="field"><input id="first" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} /></label>
        </div>
        <div className="stack">
          <label className="lbl" htmlFor="last">Last name</label>
          <label className="field"><input id="last" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} /></label>
        </div>
        <p className="small">Use your full legal name.</p>
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
