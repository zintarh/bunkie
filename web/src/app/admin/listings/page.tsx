"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { naira } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AdminShell, adminCall } from "../AdminShell";
import styles from "../admin.module.css";

type Photo = { path: string; shot: string; distance_m: number | null; flagged: boolean };
type Listing = { id: string; area_name: string; status: string; host_id: string; host_name: string; monthly_total: number; address_line: string | null; lat: number | null; lng: number | null; photos: Photo[] };
const STATUSES = [["flagged", "In review"], ["live", "Live"], ["paused", "Paused"]] as const;

export default function Listings() {
  const [status, setStatus] = useState<string>("flagged");
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    supabaseBrowser()?.rpc("admin_listings", { p_status: status }).then(({ data }) => setRows((data ?? []) as Listing[]));
  }, [status]);
  useEffect(load, [load]);

  const decide = async (l: Listing, outcome: "approve" | "pause" | "remove") => {
    setBusy(l.id);
    setErr(await adminCall("admin_listing_decision", { p_listing: l.id, p_outcome: outcome }));
    setBusy(null);
    load();
  };

  return (
    <AdminShell title="Listings" actions={
      <div className={styles.actions}>
        {STATUSES.map(([v, label]) => <button key={v} className={`${styles.btn} ${status === v ? styles.primary : ""}`} onClick={() => setStatus(v)}>{label}</button>)}
      </div>}>
      {err && <p className="err" style={{ marginBottom: 12 }}>{err}</p>}
      {rows === null ? null : rows.length === 0 ? <div className={styles.empty}>Nothing here.</div> : (
        <div className={styles.list}>
          {rows.map((l) => (
            <div key={l.id} className={styles.item}>
              <div className={styles.row}>
                <b>{l.area_name || "No area"}</b><span className={styles.meta}>· {l.host_name} · {naira(l.monthly_total)} a month</span>
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
                {l.status !== "live" && <button className={`${styles.btn} ${styles.primary}`} disabled={busy === l.id} onClick={() => decide(l, "approve")}>Approve and publish</button>}
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
