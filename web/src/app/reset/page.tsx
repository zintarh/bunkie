"use client";
import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { EMAIL_RE } from "@/components/auth";
import { TopBar } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Reset() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    await supabaseBrowser()?.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/account/password`,
    });
    setBusy(false);
    setSent(true);   // Same answer whether or not the email has an account.
  };

  return (
    <main className="screen">
      <TopBar back="/login" />
      <div className="body">
        {sent ? (
          <div className="open stack" style={{ gap: 14 }}>
            <span className="tile t-mint" style={{ width: 60, height: 60, borderRadius: 999 }}><MailCheck size={28} /></span>
            <h1 className="h1">Check your email</h1>
            <p className="sub">If {email} has an account, a reset link is on its way.</p>
            <button className="link" style={{ alignSelf: "flex-start" }} onClick={send}>Resend link</button>
          </div>
        ) : (
          <>
            <h1 className="h1">Reset your password</h1>
            <div className="stack">
              <label className="lbl" htmlFor="email">Email</label>
              <label className="field"><input id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value.trim())} /></label>
            </div>
          </>
        )}
      </div>
      <div className="foot">
        {sent ? <Link className="btn" href="/login">Back to log in</Link>
          : <button className="btn" disabled={!EMAIL_RE.test(email) || busy} onClick={send}>{busy ? <span className="spin" /> : "Send reset link"}</button>}
      </div>
    </main>
  );
}
