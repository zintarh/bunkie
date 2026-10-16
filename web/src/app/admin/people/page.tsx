"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { CORPER_LABEL } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AdminShell, Empty, Skeleton, adminCall, when } from "../AdminShell";
import styles from "../admin.module.css";

type Person = {
  id: string; first_name: string; last_name: string | null; email: string; phone: string | null; is_verified: boolean; is_host: boolean;
  standing: number; corper_status: string | null; corper_verified: boolean; suspended_at: string | null; suspended_reason: string | null;
  created_at: string; listings: number; bookings: number; reports_against: number;
};

function People() {
  const initial = useSearchParams().get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [rows, setRows] = useState<Person[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback((text: string) => {
    supabaseBrowser()?.rpc("admin_people", { p_query: text || null }).then(({ data }) => setRows((data ?? []) as Person[]));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  const suspend = async (p: Person, on: boolean) => {
    const reason = on ? window.prompt(`Why suspend ${p.first_name}?`) : null;
    if (on && reason === null) return;
    setBusy(p.id);
    setErr(await adminCall("admin_suspend", { p_user: p.id, p_suspend: on, p_reason: reason }));
    setBusy(null);
    load(q);
  };

  return (
    <AdminShell title="People" description="Corpers and hosts. Suspend someone to stop them requesting, messaging or listing."
      actions={<input className={styles.search} placeholder="Name, email, phone or id" value={q} onChange={(e) => setQ(e.target.value)} />}>
      {err && <p className="err" style={{ marginBottom: 12 }}>{err}</p>}
      {rows === null ? <Skeleton rows={1} height={300} /> : rows.length === 0 ? <Empty title="No one found" /> : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Person</th><th>Contact</th><th>Status</th><th>Activity</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.first_name} {p.last_name ?? ""}</b></td>
                  <td>{p.email}<div className={styles.meta}>{p.phone ?? "No phone"}</div></td>
                  <td><div className={styles.row}>
                    {p.suspended_at && <span className={`${styles.tag} ${styles.red}`}>Suspended</span>}
                    {p.is_verified ? <span className={`${styles.tag} ${styles.green}`}>Verified</span> : <span className={styles.tag}>Not verified</span>}
                    {p.is_host && <span className={styles.tag}>Host</span>}
                    {p.corper_verified && (p.corper_status === "serving" || p.corper_status === "served") && <span className={`${styles.tag} ${styles.amber}`}>{CORPER_LABEL[p.corper_status]}</span>}
                  </div>{p.suspended_reason && <div className={styles.meta}>{p.suspended_reason}</div>}</td>
                  <td className={styles.meta}>{p.listings} rooms · {p.bookings} bookings · {p.reports_against} reports · standing {p.standing}</td>
                  <td className={styles.meta}>{when(p.created_at)}</td>
                  <td>{p.suspended_at
                    ? <button className={styles.btn} disabled={busy === p.id} onClick={() => suspend(p, false)}>Restore</button>
                    : <button className={`${styles.btn} ${styles.danger}`} disabled={busy === p.id} onClick={() => suspend(p, true)}>Suspend</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

export default function Page() {
  return <Suspense><People /></Suspense>;
}
