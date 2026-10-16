"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROOM_LABEL, naira } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AdminShell, Empty, Skeleton, Tabs, adminCall, useAdminCounts, when } from "../AdminShell";
import styles from "../admin.module.css";

type Photo = { path: string; shot: string; distance_m: number | null; flagged: boolean };
type Listing = {
  id: string; area_name: string; status: string; host_id: string; host_name: string; monthly_total: number; address_line: string | null;
  lat: number | null; lng: number | null; photos: Photo[]; submitted_at: string | null; host_verified: boolean; room_kind: string | null;
};
const STATUSES = [["in_review", "Waiting"], ["live", "Live"], ["paused", "Paused"]] as const;

export default function Listings() {
  const [status, setStatus] = useState<string>("in_review");
  const { refresh } = useAdminCounts();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    supabaseBrowser()?.rpc("admin_listings", { p_status: status }).then(({ data }) => setRows((data ?? []) as Listing[]));
  }, [status]);
  useEffect(load, [load]);

  const decide = async (l: Listing, outcome: "approve" | "changes" | "pause" | "remove") => {
    setBusy(l.id);
    setErr(await adminCall("admin_listing_decision", { p_listing: l.id, p_outcome: outcome, p_note: notes[l.id] ?? null }));
    setBusy(null);
    load();
    refresh();
  };

  return (
    <AdminShell title="Listings" description="New rooms wait here until you approve them."
      actions={<Tabs value={status} onChange={setStatus} options={STATUSES} />}>
      {err && <p className="err" style={{ marginBottom: 12 }}>{err}</p>}
      {rows === null ? <Skeleton height={260} /> : rows.length === 0 ? <Empty title={status === "in_review" ? "No listings waiting" : "Nothing here"} /> : (
        <div className={styles.list}>
          {rows.map((l) => (
            <div key={l.id} className={styles.item}>
              <div className={styles.row}>
                <b>{l.area_name || "No area"}</b><span className={styles.meta}>· {l.room_kind ? ROOM_LABEL[l.room_kind] : ""} · {naira(l.monthly_total)} a month · {l.host_name}</span>
                {l.host_verified ? <span className={`${styles.tag} ${styles.green}`}>Host verified</span> : <span className={`${styles.tag} ${styles.amber}`}>Host not verified</span>}
                {l.status === "flagged" && <span className={`${styles.tag} ${styles.red}`}>Photos far from pin</span>}
                {l.submitted_at && <span className={styles.meta}>Sent {when(l.submitted_at)}</span>}
                <Link href={`/rooms/${l.id}`} className={styles.meta} style={{ marginLeft: "auto" }}>Open room</Link>
              </div>
              {l.address_line && <span className={styles.meta}>{l.address_line}{l.lat != null && <> · <a href={`https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`} target="_blank" rel="noreferrer">pin on map</a></>}</span>}
              <div className={styles.photos}>
                {l.photos.map((p) => (
                  <div key={p.path} className={styles.photo}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(p.path)} alt={p.shot} />
                    <span className={`${styles.tag} ${p.flagged ? styles.red : styles.green}`}>{p.shot} · {p.distance_m != null ? `${p.distance_m} m` : "no location"}</span>
                  </div>
                ))}
              </div>
              <div className={styles.actions}>
                {(l.status === "in_review" || l.status === "flagged") && (
                  <input className={styles.note} placeholder="What should the host change?" value={notes[l.id] ?? ""} onChange={(e) => setNotes({ ...notes, [l.id]: e.target.value })} />
                )}
                {l.status !== "live" && <button className={`${styles.btn} ${styles.primary}`} disabled={busy === l.id} onClick={() => decide(l, "approve")}>Approve and publish</button>}
                {(l.status === "in_review" || l.status === "flagged") && (
                  <button className={styles.btn} disabled={busy === l.id || !notes[l.id]?.trim()} onClick={() => decide(l, "changes")}>Send back</button>
                )}
                {l.status !== "paused" && <button className={styles.btn} disabled={busy === l.id} onClick={() => decide(l, "pause")}>Pause</button>}
                <button className={`${styles.btn} ${styles.danger}`} disabled={busy === l.id} onClick={() => decide(l, "remove")}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
