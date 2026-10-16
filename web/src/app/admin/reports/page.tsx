"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { naira } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AdminShell, adminCall, when } from "../AdminShell";
import styles from "../admin.module.css";

type Report = {
  id: string; kind: string; details: string | null; status: string; created_at: string; resolution: string | null;
  booking_id: string | null; booking_status: string | null; listing_id: string | null; area_name: string | null;
  reporter_id: string; reporter_name: string; other_id: string | null; other_name: string | null; paid_kobo: number;
};
const KIND: Record<string, string> = {
  danger: "Danger", not_as_listed: "Not as listed", cant_get_in: "Can't get in", no_show: "No-show",
  payment: "Payment", behaviour: "Behaviour", other: "Other",
};

export default function Reports() {
  const [open, setOpen] = useState(true);
  const [rows, setRows] = useState<Report[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [keeps, setKeeps] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    supabaseBrowser()?.rpc("admin_reports", { p_open: open }).then(({ data }) => setRows((data ?? []) as Report[]));
  }, [open]);
  useEffect(load, [load]);

  const resolve = async (r: Report, outcome: "refund" | "release" | "dismiss") => {
    setBusy(r.id);
    setErr(await adminCall("admin_resolve_report", { p_report: r.id, p_outcome: outcome, p_note: notes[r.id] ?? null }));
    setBusy(null);
    load();
  };

  return (
    <AdminShell title="Reports" actions={
      <div className={styles.actions}>
        <button className={`${styles.btn} ${open ? styles.primary : ""}`} onClick={() => setOpen(true)}>Open</button>
        <button className={`${styles.btn} ${!open ? styles.primary : ""}`} onClick={() => setOpen(false)}>Closed</button>
      </div>}>
      {err && <p className="err" style={{ marginBottom: 12 }}>{err}</p>}
      {rows === null ? null : rows.length === 0 ? <div className={styles.empty}>No {open ? "open" : "closed"} reports.</div> : (
        <div className={styles.list}>
          {rows.map((r) => (
            <div key={r.id} className={styles.item}>
              <div className={styles.row}>
                <span className={`${styles.tag} ${r.kind === "danger" ? styles.red : styles.amber}`}>{KIND[r.kind] ?? r.kind}</span>
                <b>{r.reporter_name}</b><span className={styles.meta}>about</span><b>{r.other_name ?? "—"}</b>
                {r.area_name && <span className={styles.meta}>· {r.area_name}</span>}
                <span className={styles.meta} style={{ marginLeft: "auto" }}>{when(r.created_at)}</span>
              </div>
              {r.details && <p style={{ whiteSpace: "pre-wrap" }}>{r.details}</p>}
              <div className={styles.row}>
                {r.booking_id && <Link href={`/bookings/${r.booking_id}`} className={styles.meta}>Booking · {r.booking_status}</Link>}
                <span className={styles.meta}>Paid in: {naira(r.paid_kobo / 100)}</span>
                <Link href={`/admin/people?q=${r.reporter_id}`} className={styles.meta}>Reporter</Link>
                {r.other_id && <Link href={`/admin/people?q=${r.other_id}`} className={styles.meta}>Other person</Link>}
              </div>
              {r.status !== "closed" && r.details?.startsWith("Deposit dispute") && r.booking_id && (
                <div className={styles.actions}>
                  <input className={styles.note} inputMode="numeric" placeholder="Host keeps ₦ (0 = all back to the corper)"
                    value={keeps[r.id] ?? ""} onChange={(e) => setKeeps({ ...keeps, [r.id]: e.target.value.replace(/\D/g, "") })} />
                  <button className={`${styles.btn} ${styles.primary}`} disabled={busy === r.id || keeps[r.id] === undefined} onClick={async () => {
                    setBusy(r.id);
                    setErr(await adminCall("admin_settle_deposit", { p_booking: r.booking_id, p_host_keeps: Number(keeps[r.id] || 0), p_note: notes[r.id] ?? null }));
                    setBusy(null);
                    load();
                  }}>Settle deposit</button>
                </div>
              )}
              {r.status !== "closed" ? (
                <div className={styles.actions}>
                  <input className={styles.note} placeholder="Note for the log" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  <button className={`${styles.btn} ${styles.danger}`} disabled={busy === r.id} onClick={() => resolve(r, "refund")}>Refund corper</button>
                  <button className={`${styles.btn} ${styles.primary}`} disabled={busy === r.id} onClick={() => resolve(r, "release")}>Release to host</button>
                  <button className={styles.btn} disabled={busy === r.id} onClick={() => resolve(r, "dismiss")}>Dismiss</button>
                </div>
              ) : <span className={`${styles.tag} ${styles.green}`}>{r.resolution}</span>}
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
