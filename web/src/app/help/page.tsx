"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Phone, Siren } from "lucide-react";
import { TopBar } from "@/components/ui";
import { errorText, useMe } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";
import { qs } from "@/lib/url";

const KINDS = [
  { value: "danger", label: "I'm not safe" }, { value: "not_as_listed", label: "Room isn't as listed" },
  { value: "cant_get_in", label: "I can't get in" }, { value: "payment", label: "Payment problem" },
  { value: "behaviour", label: "Someone's behaviour" }, { value: "other", label: "Something else" },
];

function Help() {
  const router = useRouter();
  const sp = useSearchParams();
  const booking = sp.get("booking");
  const listing = sp.get("listing");
  const [me] = useMe();
  const [kind, setKind] = useState<string | null>(listing ? "not_as_listed" : null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const db = supabaseBrowser();
    if (!me || !db) return router.push(`/login?next=${qs(window.location.pathname + window.location.search)}`);
    setBusy(true);
    setError(null);
    const { error } = await db.from("reports").insert({
      reporter_id: me.user.id, booking_id: booking, listing_id: listing?.startsWith("demo-") ? null : listing, kind, details: details.trim() || null,
    });
    setBusy(false);
    if (error) return setError(errorText(error));
    setSent(true);
  };

  return (
    <main className="screen">
      <TopBar back />
      <div className="body">
        <h1 className="h1">Get help</h1>
        <a className="banner red" href="tel:112" style={{ fontWeight: 700 }}><Siren size={22} />In danger? Call 112 now</a>
        {sent ? (
          <div className="banner green open">Sent. We&apos;ll reply by email.</div>
        ) : (
          <>
            <div className="stack" style={{ gap: 10 }}>
              {KINDS.map((k) => (
                <button key={k.value} className={kind === k.value ? "opt on" : "opt"} style={{ minHeight: 54 }} aria-pressed={kind === k.value} onClick={() => setKind(k.value)}>{k.label}</button>
              ))}
            </div>
            <label className="field" style={{ alignItems: "flex-start" }}>
              <span className="sr-only">What happened</span>
              <textarea rows={4} maxLength={2000} placeholder="What happened?" value={details} onChange={(e) => setDetails(e.target.value)} />
            </label>
            {error && <p className="err" role="alert">{error}</p>}
          </>
        )}
        <p className="note"><Phone size={16} style={{ flexShrink: 0, marginTop: 1 }} />Support: [support phone] · [support email]</p>
      </div>
      {!sent && <div className="foot"><button className="btn" disabled={!kind || busy} onClick={send}>{busy ? <span className="spin" /> : "Send"}</button></div>}
    </main>
  );
}

export default function Page() {
  return <Suspense><Help /></Suspense>;
}
