"use client";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AdminShell, Empty, Skeleton, Tabs, adminCall, when } from "../AdminShell";
import styles from "../admin.module.css";

type V = { id: string; user_id: string; first_name: string; kind: string; status: string; provider: string | null; masked_name: string | null; path: string | null; result: Record<string, unknown>; created_at: string };
const KIND: Record<string, string> = {
  phone: "Phone", nin: "NIN", liveness: "Selfie", call_up: "Call-up letter", ppa_letter: "PPA acceptance letter",
  discharge: "NYSC certificate", proof_of_address: "Proof of address",
};

export default function Verifications() {
  const [status, setStatus] = useState<string | null>("pending");
  // NIN passes need the gender on the NIN record.
  const [gender, setGender] = useState<Record<string, "female" | "male">>({});
  const [rows, setRows] = useState<V[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    supabaseBrowser()?.rpc("admin_verifications", { p_status: status }).then(({ data }) => setRows((data ?? []) as V[]));
  }, [status]);
  useEffect(load, [load]);

  // Documents are private: open them through a link that works for a few minutes.
  const open = async (path: string) => {
    const { data, error } = (await supabaseBrowser()?.storage.from("kyc").createSignedUrl(path, 300)) ?? {};
    if (error || !data) return setErr(error?.message ?? "Couldn't open the document.");
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const decide = async (v: V, passed: boolean) => {
    if (passed && v.kind === "nin" && !gender[v.id]) return setErr("Pick the gender on their NIN record first.");
    setBusy(v.id);
    setErr(await adminCall("admin_set_verification", {
      p_user: v.user_id, p_kind: v.kind, p_passed: passed, p_note: null, p_gender: v.kind === "nin" && passed ? gender[v.id] : null,
    }));
    setBusy(null);
    load();
  };

  return (
    <AdminShell title="ID checks" description="Check each one against its document or the NIN record, then pass or fail it."
      actions={<Tabs value={status} onChange={setStatus} options={[["pending", "Waiting"], ["failed", "Failed"], ["passed", "Passed"], [null, "All"]] as const} />}>
      {err && <p className="err" style={{ marginBottom: 12 }}>{err}</p>}
      {rows === null ? <Skeleton rows={1} height={300} /> : rows.length === 0 ? <Empty title="Nothing here" /> : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>When</th><th>Person</th><th>Check</th><th>Result</th><th>By</th><th>Document</th><th></th></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td>{when(v.created_at)}</td>
                  <td>{v.first_name}{v.masked_name ? <div className={styles.meta}>{v.masked_name}</div> : null}</td>
                  <td>{KIND[v.kind] ?? v.kind}<Details v={v} /></td>
                  <td><span className={`${styles.tag} ${v.status === "passed" ? styles.green : v.status === "pending" ? "" : styles.red}`}>{v.status === "pending" ? "waiting" : v.status}</span>
                    {typeof v.result?.reason === "string" && <div className={styles.meta}>{v.result.reason}</div>}</td>
                  <td className={styles.meta}>{v.provider}</td>
                  <td>{v.path ? <button className={styles.btn} onClick={() => open(v.path!)}>Open</button> : <span className={styles.meta}>—</span>}</td>
                  <td><div className={styles.actions}>
                    {v.kind === "nin" && v.status === "pending" && (
                      <select className={styles.btn} aria-label="Gender on the NIN record" value={gender[v.id] ?? ""}
                        onChange={(e) => setGender({ ...gender, [v.id]: e.target.value as "female" | "male" })}>
                        <option value="" disabled>Gender</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                      </select>
                    )}
                    <button className={`${styles.btn} ${styles.primary}`} disabled={busy === v.id} onClick={() => decide(v, true)}>Pass</button>
                    <button className={styles.btn} disabled={busy === v.id} onClick={() => decide(v, false)}>Fail</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}

/** What the person sent, for checking: NIN and date of birth, state code, meter or certificate number. */
function Details({ v }: { v: V }) {
  const r = v.result ?? {};
  const facts = [
    typeof r.nin === "string" ? `NIN ${r.nin}` : null,
    typeof r.dob === "string" ? `Born ${r.dob}` : null,
    typeof r.state_code === "string" ? r.state_code : null,
    typeof r.meter === "string" ? `Meter ${r.meter}` : null,
    typeof r.certificate_number === "string" ? `Certificate ${r.certificate_number}` : null,
  ].filter(Boolean);
  return facts.length ? <div className={styles.meta}>{facts.join(" · ")}</div> : null;
}
