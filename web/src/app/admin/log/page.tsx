"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AdminShell, Empty, Skeleton, when } from "../AdminShell";
import styles from "../admin.module.css";

type Log = { id: number; admin_name: string; action: string; target_type: string; target_id: string; details: Record<string, unknown>; created_at: string };

export default function ActivityLog() {
  const [rows, setRows] = useState<Log[] | null>(null);
  useEffect(() => {
    supabaseBrowser()?.rpc("admin_log", { p_limit: 300 }).then(({ data }) => setRows((data ?? []) as Log[]));
  }, []);
  return (
    <AdminShell title="Activity log" description="Everything the team did, newest first.">
      {rows === null ? <Skeleton rows={1} height={300} /> : rows.length === 0 ? <Empty title="No team activity yet" /> : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>When</th><th>Who</th><th>Did</th><th>On</th><th>Details</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>{when(l.created_at)}</td><td>{l.admin_name}</td><td>{l.action.replace(/_/g, " ")}</td>
                  <td className={styles.meta}>{l.target_type} {l.target_id.slice(0, 8)}</td>
                  <td className={styles.meta}>{Object.entries(l.details ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
