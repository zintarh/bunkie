"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AdminShell, when } from "../AdminShell";
import styles from "../admin.module.css";

type Flagged = { conversation_id: string; reasons: string[]; flagged_at: string; tenant_name: string; host_name: string; area_name: string | null; contacts_unlocked: boolean };
const REASON: Record<string, string> = { off_platform_payment: "Asked for payment outside Bunkie", reported_from_chat: "Reported by a user" };

export default function Chats() {
  const [rows, setRows] = useState<Flagged[] | null>(null);
  useEffect(() => {
    supabaseBrowser()?.rpc("admin_flagged_chats").then(({ data }) => setRows((data ?? []) as Flagged[]));
  }, []);
  return (
    <AdminShell title="Flagged chats">
      {rows === null ? null : rows.length === 0 ? <div className={styles.empty}>No chats waiting.</div> : (
        <div className={styles.list}>
          {rows.map((c) => (
            <Link key={c.conversation_id} href={`/admin/chats/${c.conversation_id}`} className={styles.item} style={{ color: "var(--ink)" }}>
              <div className={styles.row}>
                <b>{c.tenant_name}</b><span className={styles.meta}>and</span><b>{c.host_name}</b>
                {c.area_name && <span className={styles.meta}>· {c.area_name}</span>}
                <span className={styles.meta} style={{ marginLeft: "auto" }}>{when(c.flagged_at)}</span>
              </div>
              <div className={styles.row}>{c.reasons.map((r) => <span key={r} className={`${styles.tag} ${styles.red}`}>{REASON[r] ?? r}</span>)}</div>
            </Link>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
