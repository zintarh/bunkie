"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { TopBar } from "@/components/ui";
import { refreshMe, useMe } from "@/lib/auth";
import { getPrefs } from "@/lib/prefs";
import { supabaseBrowser } from "@/lib/supabase/client";
import { qs } from "@/lib/url";
import { neededChecks, sentKinds } from "@/lib/verification";

/**
 * Requesting a room and posting what you need are for verified corp members only
 * (settings.require_verification_to_request). Not sent yet: off to /verify, back here after.
 * Sent and being looked at: "Your account is under review". Verified: the page itself.
 */
export function VerifyGate({ here, back, saved, children }: { here: string; back: string; saved?: string; children: ReactNode }) {
  const router = useRouter();
  const [me] = useMe();
  const [state, setState] = useState<"checking" | "review" | "ok">("checking");

  useEffect(() => {
    const db = supabaseBrowser();
    if (!db || !me) return;
    (async () => {
      const { data: rule } = await db.from("settings").select("value").eq("key", "require_verification_to_request").maybeSingle();
      const fresh = await refreshMe();
      if (rule?.value === false || fresh?.profile.is_verified) return setState("ok");
      const { data: rows } = await db.rpc("my_verification");
      const sent = sentKinds(rows as { kind: string; status: string }[] | null);
      const stage = getPrefs().stage;
      const needed = neededChecks(!!fresh?.profile.is_host, stage === "have_ppa" || stage === "serving");
      if (!needed.every((k) => sent.has(k))) return router.replace(`/verify?next=${qs(here)}`);
      setState("review");
    })();
  }, [me, here, router]);

  if (state === "ok") return <>{children}</>;
  if (state === "checking") {
    return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><span className="spin dark" aria-label="Loading" /></main>;
  }
  return (
    <main className="screen">
      <TopBar back={back} />
      <div className="body" style={{ gap: 16 }}>
        <span className="tile t-mint" style={{ width: 56, height: 56, borderRadius: 999 }}><ShieldCheck size={28} /></span>
        <h1 className="h1">Your account is under review</h1>
        <p className="sub">{saved ? `${saved} ` : ""}We&apos;ll let you know when you&apos;re verified.</p>
      </div>
      <div className="foot"><Link className="btn" href="/explore">Keep browsing</Link></div>
    </main>
  );
}
