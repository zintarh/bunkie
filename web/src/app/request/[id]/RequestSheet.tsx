"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Video } from "lucide-react";
import { Seg, Stepper, TopBar } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { loadDraft, saveDraft } from "@/lib/draft";
import { addMonths, dayLabel, dayParts, isoDay, months as monthsLabel, naira, parseDay, weeks as weeksLabel } from "@/lib/format";
import { BATCHES } from "@/lib/places";
import { usePrefs } from "@/lib/prefs";
import type { RoomDetail } from "@/lib/types";
import { qs } from "@/lib/url";

export function RequestSheet({ room }: { room: RoomDetail }) {
  const router = useRouter();
  const [me] = useMe();
  const [prefs, ready] = usePrefs();
  const inCamp = prefs.stage === "in_camp";
  const campEnd = BATCHES.find((b) => b.id === prefs.batchId)?.campEnd ?? null;
  const maxMonths = inCamp ? Math.min(3, room.max_months) : room.max_months;
  const minMonths = room.min_months;

  // Next 21 days from the later of today and the room's free date.
  const days = useMemo(() => {
    const today = new Date();
    const from = room.available_from && parseDay(room.available_from) > today ? parseDay(room.available_from) : today;
    return Array.from({ length: 21 }, (_, i) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + i));
  }, [room.available_from]);

  const [moveIn, setMoveIn] = useState<string>(isoDay(days[0]));
  const [m, setM] = useState(Math.max(minMonths, Math.min(3, maxMonths)));
  const [message, setMessage] = useState("");
  // Short stays (1-4 weeks) when the host offers them.
  const canShort = room.open_to_short && !!room.weekly_price;
  const [unit, setUnit] = useState<"weeks" | "months">("months");
  const [w, setW] = useState(2);
  const short = canShort && unit === "weeks";

  useEffect(() => {
    if (!ready) return;
    const d = loadDraft(room.id);
    if (d) {
      setMoveIn(d.moveIn);
      setM(d.months);
      if (d.weeks && canShort) {
        setUnit("weeks");
        setW(d.weeks);
      }
      setMessage(d.message);
    } else if (inCamp && campEnd) setMoveIn(campEnd);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const end = short ? parseDay(moveIn) : addMonths(parseDay(moveIn), m);
  end.setDate(end.getDate() + (short ? 7 * w : 0) - 1);
  const deposit = short ? 0 : room.deposit ?? 0;
  const first = short ? (room.weekly_price ?? 0) * w
    : room.pay_schedule === "lump_sum" ? room.monthly_total * m + deposit : room.monthly_total + deposit;

  const go = () => {
    saveDraft({ listingId: room.id, hostName: room.host_first_name, moveIn, months: m, weeks: short ? w : null, message });
    const next = `/request/${room.id}/send`;
    router.push(me ? next : `/signup?next=${qs(next)}`);
  };

  return (
    <main className="screen">
      <TopBar back close title={inCamp ? "Request a camp booking" : `Request to bunk with ${room.host_first_name}`} />
      <div className="body" style={{ gap: 24 }}>
        <section className="stack" style={{ gap: 12 }}>
          <span className="h2">Move in</span>
          {inCamp && campEnd ? (
            <div className="soft row">
              <span className="stack" style={{ alignItems: "center", width: 52, gap: 0 }}>
                <span className="lbl" style={{ fontSize: 11 }}>{dayParts(parseDay(campEnd)).mon.toUpperCase()}</span>
                <span style={{ fontWeight: 800, fontSize: 22 }}>{parseDay(campEnd).getDate()}</span>
              </span>
              <span className="stack" style={{ gap: 0 }}>
                <span style={{ fontWeight: 700 }}>{dayLabel(campEnd)}</span>
                <span className="small">The day you leave camp</span>
              </span>
            </div>
          ) : (
            <div className="chips scroll" role="radiogroup" aria-label="Move-in date">
              {days.map((d) => {
                const p = dayParts(d);
                const on = isoDay(d) === moveIn;
                return (
                  <button key={isoDay(d)} type="button" role="radio" aria-checked={on} aria-label={dayLabel(d)} onClick={() => setMoveIn(isoDay(d))}
                    className={on ? "chip on" : "chip"} style={{ flexDirection: "column", width: 58, height: 72, padding: 0, gap: 0, borderRadius: 14, justifyContent: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{p.dow}</span>
                    <span style={{ fontSize: 20, fontWeight: 800 }}>{p.num}</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{p.mon}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="stack" style={{ gap: 10 }}>
          {canShort && (
            <Seg label="Stay length" value={unit} onChange={setUnit}
              options={[{ value: "weeks", label: "1–4 weeks" }, { value: "months", label: `${minMonths}–${maxMonths} months` }]} />
          )}
          <div className="between">
            <span className="stack" style={{ gap: 2 }}>
              <span className="h2">How long</span>
              <span className="small">Until {dayLabel(end, true)}</span>
            </span>
            {short
              ? <Stepper value={w} min={1} max={4} onChange={setW} format={weeksLabel} label="weeks" />
              : <Stepper value={m} min={minMonths} max={maxMonths} onChange={setM} format={monthsLabel} label="months" />}
          </div>
          {!short && (
            <span className="small">
              {inCamp ? "Camp bookings are 1 to 3 months. Extend after you get your PPA." : `${room.host_first_name} accepts ${minMonths} to ${room.max_months} months`}
            </span>
          )}
        </section>

        {inCamp && (
          <section className="stack" style={{ gap: 10 }}>
            <span className="h2">Viewing</span>
            <div className="row"><span className="tile t-mint"><Video size={20} /></span><span>Video call with {room.host_first_name}, from camp</span></div>
          </section>
        )}

        <section className="card stack" style={{ gap: 10 }}>
          <span className="h2">Cost</span>
          {short
            ? <div className="kv num"><span>Weekly, all in</span><span>{naira(room.weekly_price)}</span></div>
            : <div className="kv num"><span>Monthly, all in</span><span>{room.total_varies ? "about " : ""}{naira(room.monthly_total)}</span></div>}
          {deposit > 0 && <div className="kv num"><span>Caution deposit</span><span>{naira(deposit)}</span></div>}
          <div className="divider" />
          <div className="kv num" style={{ fontWeight: 700 }}><span style={{ color: "var(--ink)" }}>{short ? "Whole stay" : "First payment"}</span><span>{naira(first)}</span></div>
          <span className="small">{short ? "Paid only after you both agree." : "Paid only after you view the room and both agree."}</span>
        </section>

        <section className="stack">
          <label className="h2" htmlFor="msg" style={{ fontSize: 16 }}>Message to {room.host_first_name} <span className="muted" style={{ fontWeight: 500 }}>· optional</span></label>
          <label className="field" style={{ alignItems: "flex-start" }}>
            <textarea id="msg" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder={inCamp ? `Hi ${room.host_first_name}, I leave camp on ${campEnd ? dayLabel(campEnd).slice(4) : "…"}` : `Hi ${room.host_first_name}, I'm posted to…`} />
          </label>
        </section>
      </div>
      <div className="foot">
        <button className="btn" onClick={go}>Continue</button>
        <span className="small" style={{ textAlign: "center" }}>You won&apos;t pay anything now</span>
      </div>
    </main>
  );
}
