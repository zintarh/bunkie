"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { EMAIL_RE, GoogleButton, NeedsSupabase, PasswordField, safeNext } from "@/components/auth";
import { TopBar } from "@/components/ui";
import { errorText } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";

function SignUp() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailBad = email.includes("@") && email.length > 6 && !EMAIL_RE.test(email);
  const ok = EMAIL_RE.test(email) && pw.length >= 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const db = supabaseBrowser();
    if (!ok || !db) return;
    setBusy(true);
    setError(null);
    const { error } = await db.auth.signUp({ email, password: pw });
    setBusy(false);
    if (error) return setError(/registered/i.test(error.message) ? "That email already has an account. Sign in instead." : errorText(error));
    router.push(`/signup/code?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  };

  return (
    <main className="screen">
      <TopBar back />
      <form className="body" onSubmit={submit} noValidate>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="h1">Create your account</h1>
          <p className="sub">To send requests and save rooms.</p>
        </div>
        <NeedsSupabase />
        <GoogleButton next={next} />
        <div className="stack">
          <label className="lbl" htmlFor="email">Email</label>
          <label className="field" style={emailBad ? { borderColor: "var(--red)" } : undefined}>
            <input id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value.trim())} />
          </label>
          {emailBad && <span className="err" style={{ fontSize: 13 }}>Enter a valid email</span>}
        </div>
        <div className="stack">
          <label className="lbl" htmlFor="pw">Password</label>
          <PasswordField id="pw" value={pw} onChange={setPw} autoComplete="new-password" />
          <span className="small" style={{ color: pw.length >= 8 ? "var(--green-text)" : undefined }}>
            {pw.length === 0 ? "At least 8 characters" : pw.length >= 8 ? "Good" : `${8 - pw.length} more characters`}
          </span>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <p className="small">By continuing you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy policy</Link>.</p>
        <div className="stack" style={{ marginTop: "auto", gap: 8 }}>
          <button className="btn" type="submit" disabled={!ok || busy}>{busy ? <span className="spin" /> : "Create account"}</button>
          <p className="small" style={{ textAlign: "center" }}>Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} style={{ fontWeight: 700 }}>Sign in</Link></p>
        </div>
      </form>
    </main>
  );
}

export default function Page() {
  return <Suspense><SignUp /></Suspense>;
}
