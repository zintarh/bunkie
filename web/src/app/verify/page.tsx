"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, FileUp, Lock, ShieldCheck, Zap } from "lucide-react";
import { RequireAuth, safeNext } from "@/components/auth";
import { DocPicker, uploadDoc } from "@/components/DocPicker";
import { Progress } from "@/components/ui";
import { errorText, refreshMe, useMe } from "@/lib/auth";
import { callFunction } from "@/lib/functions";
import { shrink } from "@/lib/image";
import { supabaseBrowser } from "@/lib/supabase/client";

type StepKey = "phone" | "nin" | "liveness" | "call_up" | "address";
const PRIVACY = "Hosts see your name, photo and a verified badge. Never your NIN, documents or phone number.";

function Verify() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = safeNext(sp.get("next"), "/profile");
  const [me] = useMe();
  const isHost = sp.get("as") === "host" || !!me?.profile.is_host;
  const steps: StepKey[] = isHost ? ["phone", "nin", "liveness", "address"] : ["phone", "nin", "liveness", "call_up"];
  const [done, setDone] = useState<Set<StepKey> | null>(null);

  const load = useCallback(async () => {
    const db = supabaseBrowser();
    if (!db) return setDone(new Set());
    const { data } = await db.rpc("my_verification");
    const passed = new Set<StepKey>(((data ?? []) as { kind: string; status: string }[])
      .filter((v) => v.status === "passed").map((v) => (v.kind === "proof_of_address" ? "address" : v.kind) as StepKey));
    setDone(passed);
  }, []);
  useEffect(() => void load(), [load]);

  const current = done ? steps.find((s) => !done.has(s)) : undefined;
  useEffect(() => {
    if (done && !current) {
      void refreshMe().then(() => router.replace(next));
    }
  }, [done, current, next, router]);

  if (!done || !current) {
    return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><span className="spin dark" aria-label="Loading" /></main>;
  }
  const n = steps.indexOf(current);
  const finish = () => setDone(new Set([...done, current]));

  return (
    <main className="screen">
      <div className="topbar"><button className="ib" aria-label="Back" onClick={() => router.back()}><ChevronLeft size={24} /></button><span className="lbl">Step {n + 1} of {steps.length}</span></div>
      <Progress value={n / steps.length} />
      {current === "phone" && <PhoneStep onDone={finish} />}
      {current === "nin" && <NinStep onDone={finish} />}
      {current === "liveness" && <LivenessStep userId={me!.user.id} onDone={finish} />}
      {current === "call_up" && <CallUpStep userId={me!.user.id} onDone={finish} />}
      {current === "address" && <AddressStep userId={me!.user.id} onDone={finish} />}
    </main>
  );
}

function Privacy() {
  return <p className="note"><Lock size={16} style={{ flexShrink: 0, marginTop: 1 }} />{PRIVACY}</p>;
}

function PhoneStep({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = phone.replace(/\D/g, "").replace(/^0/, "");
  const e164 = `+234${digits}`;

  const send = async () => {
    setBusy(true);
    setError(null);
    const { error } = (await supabaseBrowser()?.auth.updateUser({ phone: e164 })) ?? {};
    setBusy(false);
    if (error) return setError(errorText(error));
    setSent(true);
  };
  const confirm = async (token: string) => {
    const db = supabaseBrowser();
    if (!db) return;
    setBusy(true);
    setError(null);
    const { error } = await db.auth.verifyOtp({ phone: e164, token, type: "phone_change" });
    if (error) {
      setBusy(false);
      return setError("That code is wrong or expired.");
    }
    try {
      await callFunction("verify", { action: "phone_confirmed" });
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="body open">
        <h1 className="h1">{sent ? "Enter the code" : "Your phone number"}</h1>
        {!sent ? (
          <div className="stack">
            <label className="lbl" htmlFor="phone">Phone number</label>
            <label className="field"><span className="prefix">+234</span>
              <input id="phone" inputMode="tel" autoComplete="tel-national" placeholder="803 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
        ) : (
          <div className="stack">
            <span className="small" style={{ fontSize: 15 }}>Sent to {e164}</span>
            <label className="field"><span className="sr-only">6-digit code</span>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} autoFocus
                onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) void confirm(v); }}
                style={{ letterSpacing: ".4em", fontSize: 22, fontWeight: 700 }} />
            </label>
            <button className="link" style={{ alignSelf: "flex-start" }} onClick={send}>Resend code</button>
          </div>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <Privacy />
      </div>
      <div className="foot">
        {!sent ? <button className="btn" disabled={digits.length !== 10 || busy} onClick={send}>{busy ? <span className="spin" /> : "Send code"}</button>
          : <button className="btn" disabled={code.length !== 6 || busy} onClick={() => confirm(code)}>{busy ? <span className="spin" /> : "Continue"}</button>}
      </div>
    </>
  );
}

function NinStep({ onDone }: { onDone: () => void }) {
  const [nin, setNin] = useState("");
  const [dob, setDob] = useState("");
  const [masked, setMasked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await callFunction<{ masked_name: string }>("verify", { action: "nin", nin, dob });
      setMasked(r.masked_name);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (masked) {
    return (
      <>
        <div className="body open">
          <h1 className="h1">Is this you?</h1>
          <div className="card stack" style={{ alignItems: "center", gap: 6, padding: 24 }}>
            <span className="tile t-mint" style={{ width: 52, height: 52, borderRadius: 999 }}><ShieldCheck size={26} /></span>
            <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: ".02em" }}>{masked}</span>
            <span className="small">Matches your date of birth</span>
          </div>
        </div>
        <div className="foot">
          <button className="btn" onClick={onDone}>Yes, that&apos;s me</button>
          <button className="link" onClick={async () => { await callFunction("verify", { action: "nin_not_me" }).catch(() => null); setMasked(null); }}>No, edit NIN</button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="body open">
        <h1 className="h1">Your NIN</h1>
        <div className="stack">
          <label className="lbl" htmlFor="nin">11-digit NIN</label>
          <label className="field"><input id="nin" inputMode="numeric" autoComplete="off" placeholder="00000000000" maxLength={11} value={nin}
            onChange={(e) => setNin(e.target.value.replace(/\D/g, "").slice(0, 11))} style={{ letterSpacing: ".08em", fontSize: 18 }} /></label>
          <span className="small num">{nin.length} of 11</span>
        </div>
        <div className="stack">
          <label className="lbl" htmlFor="dob">Date of birth</label>
          <label className="field"><input id="dob" type="date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} /></label>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <Privacy />
      </div>
      <div className="foot"><button className="btn" disabled={nin.length !== 11 || !dob || busy} onClick={lookup}>{busy ? <span className="spin" /> : "Continue"}</button></div>
    </>
  );
}

function LivenessStep({ userId, onDone }: { userId: string; onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<"idle" | "camera" | "checking">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  const start = async () => {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 } }, audio: false });
      setPhase("camera");
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = stream.current;
          void video.current.play();
        }
      });
    } catch {
      setError("Allow camera access to do the liveness check.");
    }
  };
  const capture = async () => {
    if (!video.current) return;
    setPhase("checking");
    try {
      const img = await shrink(video.current, 720, 0.85);
      stream.current?.getTracks().forEach((t) => t.stop());
      const path = `${userId}/selfie-${Date.now()}.${img.ext}`;
      const up = await supabaseBrowser()!.storage.from("kyc").upload(path, img.blob, { contentType: img.blob.type });
      if (up.error) throw up.error;
      await callFunction("verify", { action: "liveness", path });
      onDone();
    } catch (e) {
      setError(errorText(e));
      setPhase("idle");
    }
  };

  return (
    <>
      <div className="body open">
        <h1 className="h1">Liveness check</h1>
        <div style={{ position: "relative", height: 340, borderRadius: 24, background: "#0A1410", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <video ref={video} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: phase === "idle" ? "none" : "block" }} />
          <span aria-hidden="true" style={{ position: "absolute", width: 190, height: 250, borderRadius: "50%", border: `3px solid ${phase === "checking" ? "#F5B83D" : "rgba(255,255,255,.6)"}` }} />
          {phase === "idle" && <Camera size={40} color="rgba(255,255,255,.5)" />}
        </div>
        <span className="small" style={{ textAlign: "center", fontSize: 15 }}>{phase === "checking" ? "Checking…" : "Fit your face in the oval"}</span>
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <div className="foot">
        {phase === "idle" && <button className="btn" onClick={start}>Start</button>}
        {phase === "camera" && <button className="btn" onClick={capture}>Take selfie</button>}
        {phase === "checking" && <button className="btn" disabled><span className="spin" /></button>}
      </div>
    </>
  );
}


function CallUpStep({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[A-Z]{2}\/\d{2}[ABC]\/\d{3,5}$/.test(code);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const path = await uploadDoc(userId, "call-up", file);
      await callFunction("verify", { action: "call_up", path, state_code: code });
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="body open">
        <h1 className="h1">Your NYSC details</h1>
        <div className="stack">
          <label className="lbl" htmlFor="sc">NYSC state code</label>
          <label className="field"><input id="sc" placeholder="FC/26B/1234" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))} /></label>
        </div>
        <DocPicker label="NYSC call-up letter" file={file} setFile={setFile} />
        {error && <p className="err" role="alert">{error}</p>}
        <p className="note"><Lock size={16} style={{ flexShrink: 0, marginTop: 1 }} />Delete your data any time.</p>
      </div>
      <div className="foot"><button className="btn" disabled={!valid || !file || busy} onClick={submit}>{busy ? <span className="spin" /> : "Finish"}</button></div>
    </>
  );
}

function AddressStep({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [kind, setKind] = useState<"meter" | "bill" | "receipt">("meter");
  const [meter, setMeter] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = kind === "meter" ? /^\d{11,13}$/.test(meter) : !!file;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const value = kind === "meter" ? meter : await uploadDoc(userId, kind, file!);
      await callFunction("verify", { action: "address", kind, value });
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const opts = [
    { v: "meter" as const, label: "Prepaid meter number", Icon: Zap },
    { v: "bill" as const, label: "Utility bill", Icon: FileUp },
    { v: "receipt" as const, label: "Tenancy receipt", Icon: FileUp },
  ];
  return (
    <>
      <div className="body open">
        <h1 className="h1">Proof of address</h1>
        <div role="radiogroup" aria-label="Proof of address" className="stack" style={{ gap: 10 }}>
          {opts.map(({ v, label, Icon }) => (
            <button key={v} role="radio" aria-checked={kind === v} className={kind === v ? "opt on" : "opt"} onClick={() => setKind(v)}>
              <span className="ico"><Icon size={20} /></span>{label}
            </button>
          ))}
        </div>
        {kind === "meter" ? (
          <div className="stack">
            <label className="lbl" htmlFor="meter">Meter number</label>
            <label className="field"><input id="meter" inputMode="numeric" value={meter} onChange={(e) => setMeter(e.target.value.replace(/\D/g, "").slice(0, 13))} /></label>
          </div>
        ) : (
          <DocPicker label={kind === "bill" ? "Utility bill" : "Tenancy receipt"} file={file} setFile={setFile} />
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <Privacy />
      </div>
      <div className="foot"><button className="btn" disabled={!ready || busy} onClick={submit}>{busy ? <span className="spin" /> : "Finish"}</button></div>
    </>
  );
}

export default function Page() {
  return <Suspense><RequireAuth next="/verify"><Verify /></RequireAuth></Suspense>;
}
