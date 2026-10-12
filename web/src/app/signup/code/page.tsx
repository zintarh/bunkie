"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { safeNext } from "@/components/auth";
import { TopBar } from "@/components/ui";
import { errorText, refreshMe } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";

function Code() {
  const router = useRouter();
  const sp = useSearchParams();
  const email = sp.get("email") ?? "";
  const next = safeNext(sp.get("next"));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const verify = async (token: string) => {
    const db = supabaseBrowser();
    if (!db) return;
    setBusy(true);
    setError(null);
    const { error } = await db.auth.verifyOtp({ email, token, type: "signup" });
    setBusy(false);
    if (error) return setError(/expired|invalid/i.test(error.message) ? "That code is wrong or expired. Check the email or send a new one." : errorText(error));
    await refreshMe();
    router.replace(`/signup/name?next=${encodeURIComponent(next)}`);
  };

  return (
    <main className="screen">
      <TopBar back={`/signup?next=${encodeURIComponent(next)}`} />
      <div className="body">
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="h1">Check your email</h1>
          <p className="sub">We sent a 6-digit code to {email}</p>
        </div>
        <label onClick={() => input.current?.focus()} style={{ position: "relative", display: "flex", gap: 8 }}>
          <span className="sr-only">6-digit code</span>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="num" style={{
              flex: 1, height: 56, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 22,
              border: `1.5px solid ${i === code.length ? "var(--green)" : "#E6EAE7"}`, boxShadow: i === code.length ? "0 0 0 3px rgba(23,168,98,.15)" : "none",
            }}>{code[i] ?? ""}</span>
          ))}
          <input ref={input} autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6}
            style={{ position: "absolute", inset: 0, opacity: 0 }}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) void verify(v);
            }} />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="row" style={{ gap: 20 }}>
          <button className="link" disabled={resent} onClick={async () => {
            await supabaseBrowser()?.auth.resend({ type: "signup", email });
            setResent(true);
          }}>{resent ? "Code sent again" : "Resend code"}</button>
          <Link className="link" href={`/signup?next=${encodeURIComponent(next)}`}>Change email</Link>
        </div>
      </div>
      <div className="foot">
        <button className="btn" disabled={code.length < 6 || busy} onClick={() => verify(code)}>{busy ? <span className="spin" /> : "Continue"}</button>
      </div>
    </main>
  );
}

export default function Page() {
  return <Suspense><Code /></Suspense>;
}
