"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { EMAIL_RE, GoogleButton, NeedsSupabase, PasswordField, safeNext } from "@/components/auth";
import { TopBar } from "@/components/ui";
import { refreshMe } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";

function Login() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = EMAIL_RE.test(email) && pw.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const db = supabaseBrowser();
    if (!ok || !db) return;
    setBusy(true);
    setError(null);
    const { error } = await db.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) {
      if (/confirm/i.test(error.message)) return router.push(`/signup/code?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
      return setError("Email or password is wrong. Try again or reset your password.");
    }
    await refreshMe();
    router.replace(next);
  };

  return (
    <main className="screen">
      <TopBar back />
      <form className="body" onSubmit={submit} noValidate>
        <h1 className="h1">Welcome back</h1>
        <NeedsSupabase />
        <GoogleButton next={next} />
        <div className="stack">
          <label className="lbl" htmlFor="email">Email</label>
          <label className="field"><input id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value.trim()); setError(null); }} /></label>
        </div>
        <div className="stack">
          <label className="lbl" htmlFor="pw">Password</label>
          <PasswordField id="pw" value={pw} onChange={(v) => { setPw(v); setError(null); }} autoComplete="current-password" invalid={!!error} />
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <Link className="link" href="/reset" style={{ alignSelf: "flex-start" }}>Forgot password?</Link>
        <div className="stack" style={{ marginTop: "auto", gap: 8 }}>
          <button className="btn" type="submit" disabled={!ok || busy}>{busy ? <span className="spin" /> : "Log in"}</button>
          <p className="small" style={{ textAlign: "center" }}>New to Bunkie? <Link href={`/signup?next=${encodeURIComponent(next)}`} style={{ fontWeight: 700 }}>Create account</Link></p>
        </div>
      </form>
    </main>
  );
}

export default function Page() {
  return <Suspense><Login /></Suspense>;
}
