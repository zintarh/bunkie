"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { BadgeCheck, Check, ChevronDown, Video } from "lucide-react";
import { QUESTIONS, fit } from "@/lib/bunkie";
import { errorText } from "@/lib/auth";
import { act, type BookingFull, type Person, type Terms } from "@/lib/bookings";
import { dayLabel, initial, naira, stayLength, timeLabel } from "@/lib/format";
import { avatarUrl } from "@/lib/photos";
import type { Answers } from "@/lib/types";

/** Runs a booking step, shows the database's sentence on failure, reloads on success. */
export function useStep(b: BookingFull, reload: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(action);
    setError(null);
    try {
      await act(b, action, payload);
      await reload();
    } catch (e) {
      setError(errorText(e));
      await reload();
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run, setError };
}

export function PersonCard({ p, sub, answers, myAnswers }: { p: Person; sub?: string; answers?: Answers | null; myAnswers?: Answers | null }) {
  const match = fit(myAnswers ?? null, answers ?? null);
  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 12 }}>
        <span className="avatar" style={{ width: 48, height: 48, fontSize: 18 }}>
          {avatarUrl(p.photo_path) ? <img src={avatarUrl(p.photo_path)!} alt="" /> : initial(p.first_name)}
        </span>
        <span className="stack" style={{ gap: 2, flex: 1 }}>
          <span className="row" style={{ gap: 6, fontWeight: 700 }}>{p.first_name}{p.is_verified && <BadgeCheck size={18} color="var(--green)" aria-label="Verified" />}</span>
          {sub && <span className="small">{sub}</span>}
        </span>
        {match && <span className="mins">{match.score}% fit</span>}
      </div>
      {answers && QUESTIONS.map((q) => (
        <div key={q.key} className="kv" style={{ fontSize: 14 }}><span>{q.topic}</span><span style={{ textAlign: "right" }}>{q.summary[answers[q.key]]}</span></div>
      ))}
    </div>
  );
}

export function Timeline({ steps }: { steps: { title: string; sub?: string; state: "done" | "now" | "todo" }[] }) {
  return (
    <ol className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 0 }}>
      {steps.map((s, i) => (
        <li key={s.title} className="row" style={{ alignItems: "flex-start", gap: 14, minHeight: 56 }}>
          <span className="stack" style={{ alignItems: "center", gap: 0, alignSelf: "stretch" }}>
            <span style={{
              width: 24, height: 24, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              background: s.state === "done" ? "var(--green)" : "#fff", border: s.state === "todo" ? "2px solid #D5DCD6" : "2px solid var(--green)", color: "#fff",
            }}>{s.state === "done" && <Check size={14} strokeWidth={3} />}</span>
            {i < steps.length - 1 && <span style={{ flex: 1, width: 2, background: s.state === "done" ? "var(--green)" : "#E3E8E1" }} />}
          </span>
          <span className="stack" style={{ gap: 2, paddingBottom: 14 }}>
            <span style={{ fontWeight: 700, color: s.state === "todo" ? "var(--muted)" : "var(--ink)" }}>{s.title}</span>
            {s.sub && <span className="small" style={{ fontSize: 14 }}>{s.sub}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

const CONSEQUENCE: Record<string, string> = { warning: "Warning", warning_then_notice: "Warning, then notice", notice: "Notice to leave" };
const REDEPLOY: Record<string, string> = { all_unused: "Unused months back", unused_minus_2w: "Unused months, minus 2 weeks" };

export function AgreementParts({ terms, hostName }: { terms: Terms; hostName: string }) {
  const [open, setOpen] = useState(0);
  const short = !!terms.weeks;
  const parts: [string, string, [string, string][]][] = [
    ["Dates", `${dayLabel(terms.move_in)} – ${dayLabel(terms.move_out, true)}`, [["Move in", dayLabel(terms.move_in, true)], ["Move out", dayLabel(terms.move_out, true)], ["Length", stayLength(terms)]]],
    short ? ["Money", `${naira(terms.weekly_price)} a week`, [
      ["Weekly, all in", naira(terms.weekly_price)],
      ["Whole stay", naira((terms.weekly_price ?? 0) * (terms.weeks ?? 0))],
      ["Payment", "Whole stay upfront"],
      ["Caution deposit", "None"],
    ]] : ["Money", `${terms.total_varies ? "about " : ""}${naira(terms.monthly_total)} a month`, [
      ["Monthly, all in", naira(terms.monthly_total)],
      ["Rent share", naira(terms.rent_monthly)],
      ...terms.costs.map((c) => [c.name, c.tenant_pays ? `${c.varies ? "about " : ""}${naira(c.amount)}` : "Included"] as [string, string]),
      ["Payment", terms.pay_schedule === "lump_sum" ? "Whole stay upfront" : "Monthly"],
      ["Caution deposit", terms.deposit ? `${naira(terms.deposit)}, refundable` : "None"],
    ]],
    ["House rules", `${terms.rules.length} ${terms.rules.length === 1 ? "rule" : "rules"}`, terms.rules.map((r) => [r.topic, `${r.choice} · ${CONSEQUENCE[r.consequence] ?? ""}`])],
    short ? ["Refunds", "Short stay", [
      ["You leave early", `Unused nights back, except the last ${terms.refunds.short_stay_no_refund_last_days ?? 3}`],
      [`${hostName} cancels`, "Full refund"],
    ]] : ["Refunds", "3 cases", [
      ["You leave early", `${terms.refunds.early_leave_notice_days} days’ notice, unused months back`],
      ["You’re redeployed", REDEPLOY[terms.refunds.redeploy_refund] ?? ""],
      [`${hostName} asks you to leave`, "Unused months back"],
    ]],
    ["Bunkie rules", "Apply to every stay", [
      ["Your payment", "Held until you move in"], ["Notice to leave", `At least ${terms.platform.min_notice_days} days`],
      ["Your belongings", "Never held"], ["Host cancels", "Full refund"],
    ]],
  ];
  return (
    <div>
      {parts.map(([title, sum, lines], i) => (
        <div key={title} style={{ borderBottom: "1px solid var(--line)" }}>
          <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}
            style={{ width: "100%", minHeight: 64, border: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 0, textAlign: "left" }}>
            <span className="stack" style={{ gap: 2 }}><span style={{ fontWeight: 700 }}>{title}</span><span className="small num" style={{ fontSize: 14 }}>{sum}</span></span>
            <ChevronDown size={20} style={{ transform: open === i ? "rotate(180deg)" : "none", transition: "transform .25s" }} />
          </button>
          {open === i && (
            <div className="open stack" style={{ gap: 8, paddingBottom: 16 }}>
              {lines.map(([k, v]) => <div key={k} className="kv num" style={{ fontSize: 14 }}><span>{k}</span><span style={{ textAlign: "right" }}>{v}</span></div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Foot({ children }: { children: ReactNode }) {
  return <div className="foot">{children}</div>;
}

export function Err({ error }: { error: string | null }) {
  return error ? <p className="err" role="alert">{error}</p> : null;
}

/** "Join video call" for a video viewing: opens 15 minutes before and stays open for an hour after. */
export function JoinCall({ b }: { b: BookingFull }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (b.viewing_mode !== "video_call" || !b.viewing_at) return null;
  const at = new Date(b.viewing_at).getTime();
  if (now > at + 60 * 60_000) return null;
  return now >= at - 15 * 60_000
    ? <Link className="btn" href={`/bookings/${b.id}/call`}><Video size={20} />Join video call</Link>
    : <button className="btn ghost" disabled><Video size={20} />Call opens at {timeLabel(new Date(at - 15 * 60_000).toISOString())}</button>;
}
