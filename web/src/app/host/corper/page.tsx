"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Award, BriefcaseBusiness, ChevronLeft, House, Lock } from "lucide-react";
import { RequireAuth, safeNext } from "@/components/auth";
import { DocPicker, uploadDoc } from "@/components/DocPicker";
import { Loading, TopBar } from "@/components/ui";
import { errorText, refreshMe, useMe } from "@/lib/auth";
import { callFunction } from "@/lib/functions";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { CorperStatus } from "@/lib/types";

const OPTIONS: { value: CorperStatus; label: string; Icon: typeof Award }[] = [
  { value: "serving", label: "Serving now", Icon: Award },
  { value: "served", label: "Served before", Icon: BriefcaseBusiness },
  { value: "not_corper", label: "No", Icon: House },
];

/**
 * "Are you a corp member?" for hosts. Serving: state code + call-up letter. Served: NYSC certificate.
 * A proven answer shows a badge on their rooms and puts them first among similar rooms.
 * Without ?next, finishing opens (or continues) their listing.
 */
function Corper() {
  const router = useRouter();
  const nextParam = useSearchParams().get("next");
  const [me] = useMe();
  const [status, setStatus] = useState<CorperStatus | null>(me?.profile.corper_status ?? null);
  const [phase, setPhase] = useState<"ask" | "prove" | "leaving">("ask");
  const [code, setCode] = useState("");
  const [cert, setCert] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setPhase("leaving");
    if (nextParam) return router.replace(safeNext(nextParam, "/host"));
    const { data, error } = await supabaseBrowser()!.rpc("start_listing");
    if (error) {
      setPhase("ask");
      return setError(errorText(error));
    }
    router.replace(`/host/listing/${data}?step=location`);
  };

  const saveAnswer = async () => {
    const db = supabaseBrowser();
    if (!db || !me || !status) return;
    setBusy(true);
    setError(null);
    const { error } = await db.from("profiles").update({ corper_status: status }).eq("id", me.user.id);
    const fresh = error ? null : await refreshMe();
    setBusy(false);
    if (error) return setError(errorText(error));
    if (status === "not_corper" || fresh?.profile.corper_verified) return finish();
    setPhase("prove");
  };

  const prove = async () => {
    if (!me || !file) return;
    setBusy(true);
    setError(null);
    try {
      if (status === "serving") {
        const path = await uploadDoc(me.user.id, "call-up", file);
        await callFunction("verify", { action: "call_up", path, state_code: code });
      } else {
        const path = await uploadDoc(me.user.id, "nysc-certificate", file);
        await callFunction("verify", { action: "discharge", path, certificate_number: cert });
      }
      await refreshMe();
      await finish();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (phase === "leaving") return <Loading />;

  if (phase === "prove") {
    const serving = status === "serving";
    const ready = !!file && (serving ? /^[A-Z]{2}\/\d{2}[ABC]\/\d{3,5}$/.test(code) : /^[A-Z0-9/-]{6,20}$/.test(cert));
    return (
      <main className="screen">
        <div className="topbar">
          <button className="ib" onClick={() => setPhase("ask")} aria-label="Back"><ChevronLeft size={24} strokeWidth={2.2} /></button>
        </div>
        <div className="body open">
          <h1 className="h1">{serving ? "Your NYSC details" : "Your NYSC certificate"}</h1>
          {serving ? (
            <div className="stack">
              <label className="lbl" htmlFor="sc">NYSC state code</label>
              <label className="field"><input id="sc" placeholder="FC/26B/1234" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))} /></label>
            </div>
          ) : (
            <div className="stack">
              <label className="lbl" htmlFor="cert">Certificate number</label>
              <label className="field"><input id="cert" autoCapitalize="characters" value={cert} onChange={(e) => setCert(e.target.value.toUpperCase().replace(/\s/g, ""))} /></label>
            </div>
          )}
          <DocPicker label={serving ? "NYSC call-up letter" : "Certificate of National Service"} file={file} setFile={setFile} />
          {error && <p className="err" role="alert">{error}</p>}
          <p className="note"><Lock size={16} style={{ flexShrink: 0, marginTop: 1 }} />Others see a badge, never the document. Delete your data any time.</p>
        </div>
        <div className="foot">
          <button className="btn" disabled={!ready || busy} onClick={prove}>{busy ? <span className="spin" /> : "Verify"}</button>
          <button className="link" style={{ alignSelf: "center" }} onClick={finish} disabled={busy}>Do this later</button>
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <TopBar back={nextParam ? safeNext(nextParam, "/host") : "/host"} />
      <div className="body">
        <h1 className="h1">Are you a corp member?</h1>
        <div role="radiogroup" aria-label="Corp member" className="stack" style={{ gap: 10 }}>
          {OPTIONS.map(({ value, label, Icon }) => (
            <button key={value} type="button" role="radio" aria-checked={status === value}
              className={status === value ? "opt on" : "opt"} onClick={() => setStatus(value)}>
              <span className="ico"><Icon size={22} strokeWidth={2.2} /></span>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{label}</span>
            </button>
          ))}
        </div>
        {me?.profile.corper_verified && status === me.profile.corper_status && (
          <span className="badge green" style={{ alignSelf: "flex-start" }}><Award size={13} strokeWidth={2.4} />Verified</span>
        )}
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <div className="foot"><button className="btn" disabled={!status || busy} onClick={saveAnswer}>{busy ? <span className="spin" /> : "Continue"}</button></div>
    </main>
  );
}

export default function Page() {
  return <Suspense><RequireAuth next="/host/corper"><Corper /></RequireAuth></Suspense>;
}
