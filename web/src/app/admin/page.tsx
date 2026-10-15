"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AdminShell, when, type Overview } from "./AdminShell";
import styles from "./admin.module.css";

type Log = { id: number; admin_name: string; action: string; target_type: string; created_at: string };

export default function AdminHome() {
  const [o, setO] = useState<Overview | null>(null);
  const [log, setLog] = useState<Log[]>([]);
  useEffect(() => {
    const db = supabaseBrowser();
    db?.rpc("admin_overview").then(({ data }) => setO(data as Overview));
    db?.rpc("admin_log", { p_limit: 8 }).then(({ data }) => setLog((data ?? []) as Log[]));
  }, []);
  const queue = [
    { href: "/admin/reports", n: o?.reports, label: "Open reports" },
    { href: "/admin/chats", n: o?.chats, label: "Flagged chats" },
    { href: "/admin/listings", n: o?.listings, label: "Listings in review" },
    { href: "/admin/verifications", n: o?.verifications, label: "Failed ID checks (30 days)" },
  ];
  return (
    <AdminShell title="Overview">
      <div className={styles.list} style={{ gap: 24 }}>
        <section className={styles.list}>
          <span className="h2">Needs a look</span>
          <div className={styles.cards}>
            {queue.map((q) => (
              <Link key={q.href} href={q.href} className={`${styles.stat} ${q.n ? styles.alert : ""}`}><b>{q.n ?? "…"}</b><span>{q.label}</span></Link>
            ))}
          </div>
        </section>
        <section className={styles.list}>
          <span className="h2">Bunkie today</span>
          <div className={styles.cards}>
            <div className={styles.stat}><b>{o?.live_listings ?? "…"}</b><span>Live rooms</span></div>
            <div className={styles.stat}><b>{o?.open_bookings ?? "…"}</b><span>Bookings in progress</span></div>
            <div className={styles.stat}><b>{o?.people ?? "…"}</b><span>People</span></div>
            <Link href="/admin/people" className={styles.stat}><b>{o?.suspended ?? "…"}</b><span>Suspended</span></Link>
          </div>
        </section>
        <section className={styles.list}>
          <span className="h2">Recent team activity</span>
          {log.length === 0 ? <div className={styles.empty}>Nothing yet.</div> : (
            <div className={styles.scroll}><table className={styles.table}><tbody>
              {log.map((l) => <tr key={l.id}><td>{when(l.created_at)}</td><td>{l.admin_name}</td><td>{l.action.replace(/_/g, " ")}</td><td>{l.target_type}</td></tr>)}
            </tbody></table></div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
