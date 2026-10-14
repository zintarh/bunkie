"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PasswordField, RequireAuth } from "@/components/auth";
import { Loading, TopBar } from "@/components/ui";
import { errorText, useMe } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Change password. Asks for the current one, unless the person just arrived from a
 * "forgot password" email (a recovery sign-in in the last 15 minutes), or never had one (Google).
 */
function NewPassword() {
  const router = useRouter();
  const [me] = useMe();
  const [needsCurrent, setNeedsCurrent] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = supabaseBrowser();
    if (!db || !me) return;
    const hasPassword = (me.user.app_metadata.providers as string[] | undefined)?.includes("email") ?? true;
    db.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      const now = Date.now() / 1000;
      const fromReset = (data?.currentAuthenticationMethods ?? [])
        .some((m) => typeof m !== "string" && ["recovery", "otp", "magiclink"].includes(m.method as string) && now - m.timestamp < 15 * 60);
      setNeedsCurrent(hasPassword && !fromReset);
    });
  }, [me]);

  const save = async () => {
    const db = supabaseBrowser();
    if (!db || !me?.user.email) return;
    setBusy(true);
    setError(null);
    if (needsCurrent) {
      const { error } = await db.auth.signInWithPassword({ email: me.user.email, password: current });
      if (error) {
        setBusy(false);
        return setError("Your current password is wrong.");
      }
    }
    const { error } = await db.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(/different|same/i.test(error.message) ? "Pick a password you haven't used here." : errorText(error));
    router.replace("/profile");
  };

  if (needsCurrent === null) return <Loading />;
  const ok = pw.length >= 8 && (!needsCurrent || current.length > 0);

  return (
    <main className="screen">
      <TopBar back="/profile" />
      <div className="body">
        <h1 className="h1">{needsCurrent ? "Change password" : "New password"}</h1>
        {needsCurrent && (
          <div className="stack">
            <label className="lbl" htmlFor="current">Current password</label>
            <PasswordField id="current" value={current} onChange={(v) => { setCurrent(v); setError(null); }} autoComplete="current-password" invalid={!!error && /current/.test(error)} />
            <Link className="link" href="/reset" style={{ alignSelf: "flex-start", fontSize: 14 }}>Forgot it?</Link>
          </div>
        )}
        <div className="stack">
          <label className="lbl" htmlFor="pw">New password</label>
          <PasswordField id="pw" value={pw} onChange={(v) => { setPw(v); setError(null); }} autoComplete="new-password" />
          <span className="small">At least 8 characters</span>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <div className="foot"><button className="btn" disabled={!ok || busy} onClick={save}>{busy ? <span className="spin" /> : "Save password"}</button></div>
    </main>
  );
}

export default function Page() {
  return <RequireAuth next="/account/password"><NewPassword /></RequireAuth>;
}
