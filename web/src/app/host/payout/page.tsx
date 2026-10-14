"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BadgeCheck, Lock } from "lucide-react";
import { RequireAuth, safeNext } from "@/components/auth";
import { TopBar } from "@/components/ui";
import { errorText, useMe } from "@/lib/auth";
import { callFunction } from "@/lib/functions";
import { supabaseBrowser } from "@/lib/supabase/client";

type Account = { bank_name: string; account_last4: string; account_name: string };

function Payout() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/host");
  const [me] = useMe();
  const [current, setCurrent] = useState<Account | null>(null);
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [bank, setBank] = useState("");
  const [acct, setAcct] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!me) return;
    supabaseBrowser()?.from("host_payout_accounts").select("bank_name, account_last4, account_name").eq("host_id", me.user.id).maybeSingle()
      .then(({ data }) => setCurrent(data));
    callFunction<{ banks: { name: string; code: string }[] }>("payout-account", { action: "banks" })
      .then((r) => setBanks(r.banks)).catch((e) => setError(errorText(e)));
  }, [me]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await callFunction("payout-account", { action: "save", bank_code: bank, account_number: acct });
      router.replace(next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (current && !editing) {
    return (
      <main className="screen">
        <TopBar back={next} />
        <div className="body">
          <h1 className="h1">Get paid</h1>
          <div className="card row">
            <span className="tile t-mint"><BadgeCheck size={20} /></span>
            <span className="stack" style={{ gap: 0 }}><b>{current.bank_name} ••{current.account_last4}</b><span className="small">{current.account_name} · name matches ID</span></span>
          </div>
        </div>
        <div className="foot"><button className="btn ghost" onClick={() => setEditing(true)}>Change account</button></div>
      </main>
    );
  }
  return (
    <main className="screen">
      <TopBar back={next} />
      <div className="body">
        <h1 className="h1">Get paid</h1>
        <div className="stack">
          <label className="lbl" htmlFor="bank">Bank</label>
          <select id="bank" className="sel" value={bank} onChange={(e) => setBank(e.target.value)}>
            <option value="">{banks.length ? "Pick your bank" : "Loading banks…"}</option>
            {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </div>
        <div className="stack">
          <label className="lbl" htmlFor="acct">Account number</label>
          <label className="field"><input id="acct" inputMode="numeric" maxLength={10} value={acct} onChange={(e) => setAcct(e.target.value.replace(/\D/g, "").slice(0, 10))} /></label>
          <span className="small">The account must be in your own name.</span>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <p className="note"><Lock size={16} style={{ flexShrink: 0, marginTop: 1 }} />Your share is paid here 24 hours after your bunkie checks in.</p>
      </div>
      <div className="foot"><button className="btn" disabled={!bank || acct.length !== 10 || busy} onClick={save}>{busy ? <span className="spin" /> : "Save account"}</button></div>
    </main>
  );
}

export default function Page() {
  return <Suspense><RequireAuth><Payout /></RequireAuth></Suspense>;
}
