"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Wallet } from "lucide-react";
import { errorText } from "@/lib/auth";
import type { BookingFull } from "@/lib/bookings";
import { dayLabel, naira } from "@/lib/format";
import { callFunction } from "@/lib/functions";
import { shrinkFile } from "@/lib/image";
import { supabaseBrowser } from "@/lib/supabase/client";

type Rent = { next_period: string | null; amount: number; due: string | null; late: boolean; paid_months: number; total_months: number };

/** Monthly stays: the next month's rent. The corper pays it here; the host sees whether it's in. */
export function RentCard({ b, role }: { b: BookingFull; role: "tenant" | "host" }) {
  const [rent, setRent] = useState<Rent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    supabaseBrowser()?.rpc("rent_status", { p_booking: b.id }).then(({ data }) => setRent(((data as Rent[]) ?? [])[0] ?? null));
  }, [b.id, b.version]);
  if (!rent || rent.total_months <= 1 || b.weeks) return null;
  if (!rent.next_period) {
    return <div className="card row" style={{ gap: 12 }}><span className="tile t-mint"><Check size={20} /></span><span>All {rent.total_months} months paid</span></div>;
  }
  const opens = new Date(new Date(rent.next_period).getTime() - 7 * 86400000);
  const canPay = Date.now() >= opens.getTime();
  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await callFunction<{ authorization_url: string }>("paystack", { booking_id: b.id });
      window.location.href = r.authorization_url;
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="between">
        <span className="stack" style={{ gap: 2 }}>
          <b>Rent for {dayLabel(rent.next_period).slice(4)}</b>
          <span className="small" style={{ color: rent.late ? "var(--red)" : undefined }}>{rent.late ? "Late · was due " : "Due "}{dayLabel(rent.next_period)} · month {rent.paid_months + 1} of {rent.total_months}</span>
        </span>
        <b className="num">{naira(rent.amount)}</b>
      </div>
      {role === "tenant" && (canPay
        ? <button className="btn sm" disabled={busy} onClick={pay}>{busy ? <span className="spin" /> : <><Wallet size={18} />Pay rent</>}</button>
        : <span className="small">You can pay from {dayLabel(opens.toISOString().slice(0, 10))}.</span>)}
      {role === "host" && <span className="small">{rent.late ? "Not paid yet." : "You get it 24 hours into that month."}</span>}
      {error && <p className="err">{error}</p>}
    </div>
  );
}

type Photo = { id: string; path: string; uploaded_by: string };

/** Move-out photos: both people can add them while moving out and during the deposit window. */
export function MoveOutPhotos({ b, me }: { b: BookingFull; me: string }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const db = supabaseBrowser();
    if (!db) return;
    const { data } = await db.from("condition_photos").select("id, path, uploaded_by").eq("booking_id", b.id).eq("phase", "move_out").order("created_at");
    const list = (data ?? []) as Photo[];
    setPhotos(list);
    if (list.length) {
      const { data: signed } = await db.storage.from("condition").createSignedUrls(list.map((p) => p.path), 3600);
      setUrls(Object.fromEntries((signed ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl]] : []))));
    }
  }, [b.id]);
  useEffect(() => void load(), [load]);

  const add = async (file: File | undefined) => {
    const db = supabaseBrowser();
    if (!file || !db) return;
    setBusy(true);
    setError(null);
    try {
      const img = await shrinkFile(file, 1600, 0.8);
      const path = `${b.id}/move-out-${crypto.randomUUID()}.${img.ext}`;
      const up = await db.storage.from("condition").upload(path, img.blob, { contentType: img.blob.type });
      if (up.error) throw up.error;
      const ins = await db.from("condition_photos").insert({ booking_id: b.id, phase: "move_out", path, uploaded_by: me });
      if (ins.error) throw ins.error;
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!photos) return null;
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <span className="h2" style={{ fontSize: 17 }}>Move-out photos</span>
      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
          {photos.map((p) => (
            <div key={p.id} className="photo" style={{ aspectRatio: "1", borderRadius: 10, backgroundImage: urls[p.path] ? `url(${urls[p.path]})` : undefined, position: "relative" }}>
              <span className="badge dark" style={{ position: "absolute", left: 4, bottom: 4, fontSize: 10, padding: "2px 6px" }}>{p.uploaded_by === me ? "You" : p.uploaded_by === b.host_id ? b.host.first_name : b.tenant.first_name}</span>
            </div>
          ))}
        </div>
      )}
      <button className="btn ghost sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? <span className="spin dark" /> : <><Camera size={18} />Add a photo</>}</button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void add(e.target.files?.[0]); e.target.value = ""; }} />
      {error && <p className="err">{error}</p>}
    </div>
  );
}

type Settlement = { deposit_kobo: number; deduction_kobo: number; reason: string | null; status: string; settled_at: string | null };

/** The caution deposit after move-out: host keeps nothing or proposes a deduction; corper accepts or disputes. */
export function DepositCard({ b, role, reload }: { b: BookingFull; role: "tenant" | "host"; reload: () => Promise<void> }) {
  const deposit = b.payments.filter((p) => p.kind === "booking" && p.status === "success").reduce((n, p) => n + (p.deposit_kobo ?? 0), 0) / 100;
  const [s, setS] = useState<Settlement | null | undefined>(undefined);
  const [keep, setKeep] = useState(0);
  const [reason, setReason] = useState("");
  const [part, setPart] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    supabaseBrowser()?.from("deposit_settlements").select("deposit_kobo, deduction_kobo, reason, status, settled_at").eq("booking_id", b.id).maybeSingle()
      .then(({ data }) => setS((data as Settlement) ?? null));
  }, [b.id]);
  useEffect(load, [load, b.version]);
  if (s === undefined || deposit <= 0) return null;

  const call = async (fn: string, args: Record<string, unknown>) => {
    const db = supabaseBrowser();
    if (!db) return;
    setBusy(true);
    setError(null);
    const { error } = await db.rpc(fn, args);
    setBusy(false);
    if (error) return setError(errorText(error));
    load();
    await reload();
  };
  const other = role === "tenant" ? b.host.first_name : b.tenant.first_name;
  const kept = (s?.deduction_kobo ?? 0) / 100;
  const until = b.deadline_at ? dayLabel(b.deadline_at) : null;

  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="between"><span className="h2" style={{ fontSize: 17 }}>Caution deposit</span><b className="num">{naira(deposit)}</b></div>
      {s?.status === "settled" ? (
        <span className="small" style={{ fontSize: 14 }}>
          {kept ? `${role === "host" ? "You keep" : `${other} keeps`} ${naira(kept)}. ${naira(deposit - kept)} goes back to ${role === "tenant" ? "you" : other}.` : `The full deposit goes back to ${role === "tenant" ? "you" : other}.`}
        </span>
      ) : s?.status === "disputed" ? (
        <span className="small" style={{ fontSize: 14 }}>Disputed. Bunkie will look at the photos and decide.</span>
      ) : s?.status === "proposed" ? (
        role === "tenant" ? (
          <>
            <span style={{ fontSize: 15 }}>{other} wants to keep <b>{naira(kept)}</b> for: {s.reason}</span>
            {until && <span className="small">If you don&apos;t answer by {until}, it goes ahead.</span>}
            {disputing ? (
              <>
                <label className="field" style={{ alignItems: "flex-start" }}><span className="sr-only">Why you disagree</span>
                  <textarea rows={3} maxLength={800} placeholder="What happened?" value={details} onChange={(e) => setDetails(e.target.value)} /></label>
                <button className="btn sm red" disabled={busy || !details.trim()} onClick={() => call("respond_deposit", { p_booking: b.id, p_accept: false, p_details: details })}>Send dispute</button>
              </>
            ) : (
              <div className="row" style={{ gap: 10 }}>
                <button className="btn sm" style={{ flex: 1 }} disabled={busy} onClick={() => call("respond_deposit", { p_booking: b.id, p_accept: true })}>Accept</button>
                <button className="btn ghost sm" style={{ flex: 1 }} disabled={busy} onClick={() => setDisputing(true)}>Dispute</button>
              </div>
            )}
          </>
        ) : <span className="small" style={{ fontSize: 14 }}>You asked to keep {naira(kept)}. Waiting for {other}.</span>
      ) : role === "host" && b.status === "moved_out" ? (
        part ? (
          <>
            <label className="field"><span className="prefix">₦</span><span className="sr-only">Amount to keep</span>
              <input inputMode="numeric" value={keep ? keep.toLocaleString("en-NG") : ""} onChange={(e) => setKeep(Math.min(deposit, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0))} /></label>
            <label className="field"><span className="sr-only">Reason</span>
              <input placeholder="What it's for, e.g. broken shelf" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <span className="small">Add move-out photos that show it.</span>
            <button className="btn sm" disabled={busy || keep <= 0 || !reason.trim()} onClick={() => call("propose_deposit", { p_booking: b.id, p_deduction: keep, p_reason: reason })}>Send to {other}</button>
            <button className="link" onClick={() => setPart(false)}>Back</button>
          </>
        ) : (
          <>
            {until && <span className="small">Decide by {until}, or the full deposit goes back to {other}.</span>}
            <button className="btn sm" disabled={busy} onClick={() => call("propose_deposit", { p_booking: b.id, p_deduction: 0 })}>Return the full deposit</button>
            <button className="btn ghost sm" disabled={busy} onClick={() => setPart(true)}>Keep part of it</button>
          </>
        )
      ) : (
        <span className="small" style={{ fontSize: 14 }}>{role === "tenant" ? `${other} has until ${until ?? "the end of the week"} to return it or ask to keep part.` : "Settled at move-out."}</span>
      )}
      {error && <p className="err">{error}</p>}
    </div>
  );
}
