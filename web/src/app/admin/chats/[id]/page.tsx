"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AdminShell, adminCall, when } from "../../AdminShell";
import styles from "../../admin.module.css";

type Line = { id: number; sender_id: string | null; sender_name: string | null; kind: string; body: string | null; original: string | null; image_path: string | null; flagged: boolean; created_at: string };

export default function ChatReview() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const db = supabaseBrowser();
    db?.rpc("admin_chat", { p_conversation: id }).then(async ({ data }) => {
      const rows = (data ?? []) as Line[];
      setLines(rows);
      const paths = rows.flatMap((r) => (r.image_path ? [r.image_path] : []));
      if (paths.length) {
        const { data: signed } = await db.storage.from("chat-media").createSignedUrls(paths, 600);
        setImages(Object.fromEntries((signed ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl]] : []))));
      }
    });
  }, [id]);

  const review = async (outcome: "ok" | "warned" | "suspended") => {
    setBusy(true);
    let e = await adminCall("admin_review_chat", { p_conversation: id, p_outcome: outcome, p_note: note || null });
    if (!e && outcome === "suspended") {
      const offender = lines?.find((l) => l.flagged)?.sender_id;
      if (offender) e = await adminCall("admin_suspend", { p_user: offender, p_suspend: true, p_reason: note || "off-platform payment" });
    }
    setBusy(false);
    if (e) return setErr(e);
    router.push("/admin/chats");
  };

  return (
    <AdminShell title="Chat review">
      {err && <p className="err" style={{ marginBottom: 12 }}>{err}</p>}
      <div className={styles.chat}>
        {(lines ?? []).map((l) => l.kind === "system" ? (
          <div key={l.id} className={`${styles.msg} ${styles.sys}`}>{l.body}</div>
        ) : (
          <div key={l.id} className={`${styles.msg} ${l.flagged ? styles.flag : ""}`}>
            <div className={styles.row}><b>{l.sender_name ?? "Deleted"}</b><span className={styles.meta}>{when(l.created_at)}</span>{l.flagged && <span className={`${styles.tag} ${styles.red}`}>Flagged</span>}</div>
            {l.image_path && images[l.image_path] && <img src={images[l.image_path]} alt="" style={{ maxWidth: 260, borderRadius: 10, marginTop: 6 }} />}
            {l.body && <p style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{l.body}</p>}
            {l.original && <div className={styles.orig}>Original: {l.original}</div>}
          </div>
        ))}
      </div>
      <div className={styles.actions} style={{ marginTop: 20, maxWidth: 760 }}>
        <input className={styles.note} placeholder="Note for the log" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={() => review("ok")}>Looks fine</button>
        <button className={styles.btn} disabled={busy} onClick={() => review("warned")}>Warn in chat</button>
        <button className={`${styles.btn} ${styles.danger}`} disabled={busy} onClick={() => review("suspended")}>Suspend sender</button>
      </div>
    </AdminShell>
  );
}
