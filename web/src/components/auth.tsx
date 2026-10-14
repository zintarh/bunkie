"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useMe } from "@/lib/auth";
import { getPrefs } from "@/lib/prefs";
import { supabaseBrowser } from "@/lib/supabase/client";
import { hasGoogle, hasSupabase } from "@/lib/supabase/config";
import { qs } from "@/lib/url";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Only allow returning to paths inside the app. */
export function safeNext(next: string | null | undefined, fallback = "/explore"): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/** "Continue with Google" plus the "or" divider; renders nothing until Google is enabled. */
export function GoogleButton({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  if (!hasGoogle) return null;
  return (
    <>
    <button type="button" className="btn ghost" disabled={busy} onClick={async () => {
      setBusy(true);
      await supabaseBrowser()?.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${qs(next)}` },
      });
    }}>
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      Continue with Google
    </button>
    <Or />
    </>
  );
}

export function Or() {
  return (
    <div className="row" style={{ gap: 12, color: "var(--muted)", fontSize: 13, fontWeight: 600 }}>
      <span className="divider" style={{ flex: 1 }} />or<span className="divider" style={{ flex: 1 }} />
    </div>
  );
}

export function PasswordField({ id, value, onChange, autoComplete, invalid }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="field" htmlFor={id} style={invalid ? { borderColor: "var(--red)" } : undefined}>
      <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
      <button type="button" className="ib" style={{ width: 40, height: 40 }} onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
    </label>
  );
}

export function NeedsSupabase() {
  if (hasSupabase) return null;
  return <div className="banner amber">Accounts work once Supabase is connected. See the README.</div>;
}

/** Copies what the visitor chose before signing up (NYSC stage, household, PPA) into their profile. */
export async function syncPrefsToProfile(userId: string) {
  const db = supabaseBrowser();
  if (!db) return;
  const p = getPrefs();
  const patch: Record<string, unknown> = {};
  if (p.stage) patch.nysc_stage = p.stage;
  if (p.pref) patch.share_pref = p.pref;
  if (p.batchId) patch.batch_id = p.batchId;
  if (p.ppa) Object.assign(patch, { ppa_label: p.ppa.label, ppa_lat: p.ppa.lat, ppa_lng: p.ppa.lng, ppa_zone_id: p.ppa.zoneId });
  if (Object.keys(patch).length) await db.from("profile_private").update(patch).eq("user_id", userId);
}

/** Renders children only for signed-in people; others go to sign-up and come back here after. */
export function RequireAuth({ children }: { children: ReactNode; next?: string }) {
  const router = useRouter();
  const [me, loading] = useMe();
  useEffect(() => {
    // Come back to exactly this page, query string included.
    const here = window.location.pathname + window.location.search;
    if (!loading && !me) router.replace(`/signup?next=${qs(here)}`);
  }, [loading, me, router]);
  if (!me) {
    return (
      <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}>
        <span className="spin dark" aria-label="Loading" />
      </main>
    );
  }
  return <>{children}</>;
}
