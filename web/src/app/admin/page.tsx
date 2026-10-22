"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, BedDouble, CalendarCheck, Flag, ListChecks, MessageSquareWarning, UserX, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AdminShell, Empty, Skeleton, useAdminCounts, when } from "./AdminShell";
import styles from "./admin.module.css";

type Log = { id: number; admin_name: string; action: string; target_type: string; created_at: string };

export default function AdminHome() {
  const { counts: o } = useAdminCounts();
  const [log, setLog] = useState<Log[] | null>(null);
  useEffect(() => {
    supabaseBrowser()?.rpc("admin_log", { p_limit: 8 }).then(({ data }) => setLog((data ?? []) as Log[]));
  }, []);
  const waiting = o ? o.reports + o.chats + o.listings : null;

  const queue = [
    { href: "/admin/reports", n: o?.reports, label: "Open reports", Icon: Flag, tone: styles.iRed },
    { href: "/admin/chats", n: o?.chats, label: "Flagged chats", Icon: MessageSquareWarning, tone: styles.iAmber },
    { href: "/admin/listings", n: o?.listings, label: "Listings waiting", Icon: ListChecks, tone: styles.iMint },
    { href: "/admin/verifications", n: o?.verifications, label: "ID checks waiting", Icon: BadgeCheck, tone: styles.iSky },
  ];
  const today = [
    { n: o?.live_listings, label: "Live rooms", Icon: BedDouble, tone: styles.iMint, href: "/admin/listings" },
    { n: o?.open_bookings, label: "Bookings in progress", Icon: CalendarCheck, tone: styles.iSky, href: null },
    { n: o?.people, label: "People", Icon: Users, tone: styles.iLilac, href: "/admin/people" },
    { n: o?.suspended, label: "Suspended", Icon: UserX, tone: styles.iRed, href: "/admin/people" },
  ];

  return (
    <AdminShell title="Overview" description={waiting === null ? " " : waiting ? `${waiting} ${waiting === 1 ? "thing needs" : "things need"} a look.` : "Nothing waiting. All clear."}>
      <div className={styles.stats}>
        {queue.map((q) => (
          <Link key={q.href} href={q.href} className={styles.stat}>
            <span className={styles.statTop}>
              <span className={`${styles.statIcon} ${q.tone}`}><q.Icon size={20} /></span>
              {q.n ? <span className={styles.statFlag}>Needs a look</span> : null}
            </span>
            <span><span className={styles.statNum}>{q.n ?? "–"}</span><br /><span className={styles.statLabel}>{q.label}</span></span>
          </Link>
        ))}
      </div>

      <section className={styles.section}>
        <h2>Bunkie today</h2>
        <div className={styles.stats}>
          {today.map((t) => {
            const inner = (
              <>
                <span className={`${styles.statIcon} ${t.tone}`}><t.Icon size={20} /></span>
                <span><span className={styles.statNum}>{t.n ?? "–"}</span><br /><span className={styles.statLabel}>{t.label}</span></span>
              </>
            );
            return t.href ? <Link key={t.label} href={t.href} className={styles.stat}>{inner}</Link> : <div key={t.label} className={styles.stat}>{inner}</div>;
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Recent team activity</h2>
        {log === null ? <Skeleton rows={1} height={160} /> : log.length === 0 ? <Empty title="No team activity yet" /> : (
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>On</th></tr></thead>
            <tbody>{log.map((l) => <tr key={l.id}><td className={styles.meta}>{when(l.created_at)}</td><td><b>{l.admin_name}</b></td><td>{l.action.replace(/_/g, " ")}</td><td className={styles.meta}>{l.target_type}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </AdminShell>
  );
}
