"use client";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { errorText } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";

/** 1-5 stars as five buttons (big enough to tap). */
export function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="between" role="radiogroup" aria-label={label}>
      <span style={{ fontWeight: 600, fontSize: 15 }}>{label}</span>
      <span className="row" style={{ gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => onChange(n)} className="ib" style={{ width: 38, height: 38 }}>
            <Star size={26} fill={n <= value ? "var(--amber)" : "none"} color={n <= value ? "var(--amber)" : "#c3ccc6"} strokeWidth={1.8} />
          </button>
        ))}
      </span>
    </div>
  );
}

type Mine = { id: string; overall: number; published_at: string | null };

/**
 * After a stay: the corper reviews the room and host, the host reviews the corper. Hidden until both
 * have reviewed or 14 days pass.
 */
export function ReviewForm({ bookingId, role, otherName, moveOut }: { bookingId: string; role: "tenant" | "host"; otherName: string; moveOut: string }) {
  const [mine, setMine] = useState<Mine | null | undefined>(undefined);
  const [overall, setOverall] = useState(0);
  const [a, setA] = useState(0);   // tenant: accuracy · host: house rules
  const [c, setC] = useState(0);   // cleanliness
  const [h, setH] = useState(0);   // tenant: the host
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closes = new Date(new Date(moveOut).getTime() + 14 * 86400000);
  const open = Date.now() < closes.getTime();

  useEffect(() => {
    supabaseBrowser()?.from("reviews").select("id, overall, published_at").eq("booking_id", bookingId)
      .eq("direction", role === "tenant" ? "of_host" : "of_tenant").maybeSingle()
      .then(({ data }) => setMine((data as Mine) ?? null));
  }, [bookingId, role]);

  if (mine === undefined) return null;
  if (mine) {
    return (
      <div className="card stack" style={{ gap: 6 }}>
        <span style={{ fontWeight: 700 }}>You left {mine.overall} {mine.overall === 1 ? "star" : "stars"}</span>
        <span className="small">{mine.published_at ? "Your review is up." : `It shows once ${otherName} reviews too, or on ${closes.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}.`}</span>
      </div>
    );
  }
  if (!open) return null;

  const ready = overall > 0 && a > 0 && c > 0 && (role === "host" || h > 0);
  const submit = async () => {
    const db = supabaseBrowser();
    if (!db) return;
    setBusy(true);
    setError(null);
    const { data, error } = await db.rpc("submit_review", role === "tenant"
      ? { p_booking: bookingId, p_overall: overall, p_accuracy: a, p_cleanliness: c, p_communication: h, p_comment: comment || null }
      : { p_booking: bookingId, p_overall: overall, p_rules: a, p_cleanliness: c, p_comment: comment || null });
    setBusy(false);
    if (error) return setError(errorText(error));
    setMine(data as Mine);
  };

  return (
    <div className="card stack" style={{ gap: 12 }}>
      <span className="h2">{role === "tenant" ? `How was your stay with ${otherName}?` : `How was ${otherName} as a bunkie?`}</span>
      <Stars label="Overall" value={overall} onChange={setOverall} />
      <Stars label={role === "tenant" ? "Room matched the listing" : "Kept the house rules"} value={a} onChange={setA} />
      <Stars label="Cleanliness" value={c} onChange={setC} />
      {role === "tenant" && <Stars label={otherName} value={h} onChange={setH} />}
      <label className="field" style={{ alignItems: "flex-start" }}>
        <span className="sr-only">Comment</span>
        <textarea rows={3} maxLength={1000} placeholder={role === "tenant" ? "What should other corpers know?" : "Optional"} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn" disabled={!ready || busy} onClick={submit}>{busy ? <span className="spin" /> : "Post review"}</button>
      <span className="small">{otherName} sees it once they review too, or after 14 days.</span>
    </div>
  );
}
