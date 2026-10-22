"use client";
import { useMemo, useState } from "react";
import { MessageSquare, Video, Wallet } from "lucide-react";
import { CLOSE_REASON } from "@/lib/bunkie";
import type { BookingFull } from "@/lib/bookings";
import { dayLabel, dayParts, isoDay, naira, slotLabel, stayLength, timeLabel, untilLabel } from "@/lib/format";
import { useMyAnswers } from "@/lib/useMyAnswers";
import { Err, Foot, JoinCall, PersonCard, useStep } from "./shared";
import { ReviewForm } from "@/components/ReviewForm";
import { DepositCard, MoveOutPhotos, RentCard } from "@/components/StayMoney";

type Props = { b: BookingFull; reload: () => Promise<void> };
const WINDOW: Record<string, string> = { morning: "8am–11am", midday: "11am–2pm", afternoon: "2pm–5pm", evening: "5pm–8pm" };
const HOURS = [9, 11, 13, 15, 17, 19];

export function HostView({ b, reload }: Props) {
  const { busy, error, run } = useStep(b, reload);
  const myAnswers = useMyAnswers();
  const t = b.tenant.first_name;
  const [confirmCancel, setConfirmCancel] = useState(false);

  const person = <PersonCard p={b.tenant} sub={`${dayLabel(b.move_in)} – ${dayLabel(b.move_out)} · ${stayLength(b)}`} answers={b.tenantAnswers} myAnswers={myAnswers} />;

  if (b.status === "requested") return <Review b={b} reload={reload} person={person} />;

  let title = "";
  let body: React.ReactNode = null;
  let foot: React.ReactNode = null;
  switch (b.status) {
    case "inspection_due":
      title = `Waiting for ${t} to pay the inspection fee`;
      body = <p className="small" style={{ fontSize: 15 }}>{b.viewing_at ? slotLabel(b.viewing_at) : ""} is held for {untilLabel(b.deadline_at)}. You get {naira(b.inspection_fee * 0.98)} once the inspection happens.</p>;
      foot = <button className="btn ghost" disabled={!!busy} onClick={() => run("decline")}>Decline</button>;
      break;
    case "accepted":
      title = `Waiting for ${t} to pick a time`;
      body = <p className="small" style={{ fontSize: 15 }}>You offered {b.offered_slots.map(slotLabel).join(", ")}.</p>;
      foot = <button className="btn ghost" disabled={!!busy} onClick={() => run("decline")}>Decline</button>;
      break;
    case "viewing_booked": {
      const started = b.viewing_at ? new Date(b.viewing_at).getTime() - 15 * 60000 < Date.now() : false;
      title = `Viewing with ${t}`;
      body = (
        <div className="card row">
          <span className="tile t-mint">{b.viewing_mode === "video_call" ? <Video size={20} /> : <MessageSquare size={20} />}</span>
          <span className="stack" style={{ gap: 0 }}><b>{b.viewing_at ? slotLabel(b.viewing_at) : ""}</b><span className="small">{b.viewing_mode === "video_call" ? "Video call · in Bunkie at the time" : "In person"}</span></span>
        </div>
      );
      foot = (
        <>
          <JoinCall b={b} />
          <button className={b.viewing_mode === "video_call" ? "btn ghost" : "btn"} disabled={!started || !!busy} onClick={() => run("viewing_done")}>The viewing happened</button>
          <div className="row" style={{ justifyContent: "center", gap: 16 }}>
            {b.reschedules < 1 && <button className="link" disabled={!!busy} onClick={() => run("reschedule")}>Reschedule</button>}
            {started && <button className="link" disabled={!!busy} onClick={() => run("no_show")}>{t} didn&apos;t show up</button>}
          </div>
        </>
      );
      break;
    }
    case "viewed":
      title = b.tenant_matched_at ? `Do you want ${t} as your bunkie?` : `Waiting for ${t}`;
      body = b.tenant_matched_at
        ? <p className="small" style={{ fontSize: 15 }}>Confirming locks the price, rules and dates. {t} confirms next, then pays.</p>
        : <p className="small" style={{ fontSize: 15 }}>{t} is checking the room matched the listing.</p>;
      foot = (
        <>
          <button className="btn" disabled={!b.tenant_matched_at || !!busy} onClick={() => run("confirm_terms")}>Confirm agreement</button>
          <button className="link" disabled={!!busy} onClick={() => run("decline")}>Not this time</button>
        </>
      );
      break;
    case "host_confirmed":
      title = `Waiting for ${t} to confirm`;
      body = <p className="small" style={{ fontSize: 15 }}>{t} has {untilLabel(b.deadline_at)} to confirm.</p>;
      break;
    case "agreed":
      title = "Waiting for payment";
      body = <p className="small" style={{ fontSize: 15 }}>{t} has {untilLabel(b.deadline_at)} to pay. Other requests for these dates close when they do.</p>;
      break;
    case "paid":
      title = `${t} moves in ${dayLabel(b.move_in)}`;
      body = (
        <>
          <div className="banner green"><Wallet size={20} />Paid. Your share is released 24 hours after {t} checks in.</div>
          <div className="kv"><span>Arriving</span><span>{b.arrival_window ? WINDOW[b.arrival_window] : "Not set yet"}</span></div>
          {confirmCancel && <div className="banner red open">Cancelling refunds {t} in full and lowers your standing.</div>}
        </>
      );
      foot = confirmCancel
        ? <><button className="btn red" disabled={!!busy} onClick={() => run("host_cancel")}>Cancel and refund {t}</button><button className="link" onClick={() => setConfirmCancel(false)}>Keep the booking</button></>
        : <button className="link" onClick={() => setConfirmCancel(true)}>I can&apos;t host anymore</button>;
      break;
    case "moved_in":
      title = `Confirm ${t} moved in`;
      foot = <button className="btn" disabled={!!busy} onClick={() => run("confirm_move_in")}>{t} has moved in</button>;
      break;
    case "active":
      title = `${t} lives here`;
      body = <><p className="small" style={{ fontSize: 15 }}>Stay ends {dayLabel(b.move_out, true)}.</p><RentCard b={b} role="host" /></>;
      foot = <button className="link" disabled={!!busy} onClick={() => run("ask_to_leave")}>Ask {t} to leave (notice applies)</button>;
      break;
    case "ending":
      title = `${t}'s last night is ${dayLabel(new Date(new Date(b.move_out).getTime() - 86400000))}`;
      body = <MoveOutPhotos b={b} me={b.host_id} />;
      foot = <button className="btn" disabled={!!busy} onClick={() => run("move_out_done")}>{t} has moved out</button>;
      break;
    case "moved_out": case "completed":
      title = "Stay finished";
      body = (
        <>
          <DepositCard b={b} role="host" reload={reload} />
          {b.status === "moved_out" && <MoveOutPhotos b={b} me={b.host_id} />}
          <ReviewForm bookingId={b.id} role="host" otherName={t} moveOut={b.move_out} />
        </>
      );
      break;
    case "closed":
      title = "Closed";
      body = <div className="banner red">{CLOSE_REASON[b.close_reason ?? ""] ?? "This booking is closed."}</div>;
      break;
  }
  return (
    <>
      <div className="body open">
        <h1 className="h1">{title}</h1>
        {body}
        {person}
        <Err error={error} />
      </div>
      {foot && <Foot>{foot}</Foot>}
    </>
  );
}

function Review({ b, reload, person }: Props & { person: React.ReactNode }) {
  const { busy, error, run } = useStep(b, reload);
  const [picking, setPicking] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const days = useMemo(() => {
    const now = new Date();
    // Camp bookings: viewings happen before camp ends, so offer the next few days.
    return Array.from({ length: 5 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i + (now.getHours() >= 18 ? 1 : 0)));
  }, []);
  const [day, setDay] = useState(isoDay(days[0]));
  const toggle = (iso: string) => setSlots((s) => (s.includes(iso) ? s.filter((x) => x !== iso) : [...s, iso].slice(-6)));

  if (picking) {
    return (
      <>
        <div className="body open">
          <h1 className="h1">When can {b.tenant.first_name} view?</h1>
          <p className="small" style={{ fontSize: 15 }}>{b.is_camp_booking ? "Camp booking: this will be a video call." : "Pick a few times. They choose one."}</p>
          <div className="chips scroll" role="radiogroup" aria-label="Day">
            {days.map((d) => {
              const p = dayParts(d);
              const on = isoDay(d) === day;
              return (
                <button key={isoDay(d)} role="radio" aria-checked={on} onClick={() => setDay(isoDay(d))} className={on ? "chip on" : "chip"}
                  style={{ flexDirection: "column", width: 58, height: 72, padding: 0, gap: 0, borderRadius: 14, justifyContent: "center" }}>
                  <span style={{ fontSize: 12 }}>{p.dow}</span><span style={{ fontSize: 20, fontWeight: 800 }}>{p.num}</span><span style={{ fontSize: 12 }}>{p.mon}</span>
                </button>
              );
            })}
          </div>
          <div className="chips">
            {HOURS.map((h) => {
              const [y, m, d] = day.split("-").map(Number);
              const dt = new Date(y, m - 1, d, h);
              const iso = dt.toISOString();
              if (dt.getTime() < Date.now() + 3600000) return null;
              return <button key={iso} className={slots.includes(iso) ? "chip on" : "chip"} aria-pressed={slots.includes(iso)} onClick={() => toggle(iso)}>{timeLabel(iso)}</button>;
            })}
          </div>
          {slots.length > 0 && <p className="small">{slots.length} {slots.length === 1 ? "time" : "times"} picked: {slots.map(slotLabel).join(", ")}</p>}
          <Err error={error} />
        </div>
        <Foot>
          <button className="btn" disabled={slots.length === 0 || !!busy} onClick={() => run("accept", { slots })}>Accept and offer times</button>
          <button className="link" onClick={() => setPicking(false)}>Back</button>
        </Foot>
      </>
    );
  }
  return (
    <>
      <div className="body open">
        <h1 className="h1">{b.tenant.first_name} wants to bunk with you</h1>
        {b.deadline_at ? <div className="banner amber">Reply within {untilLabel(b.deadline_at)}</div> : <div className="banner green">Waiting in line. Finish your current request for this room first.</div>}
        {person}
        {b.is_camp_booking && <div className="banner green"><Video size={18} />Camp booking · moves in on camp exit day</div>}
        {b.message && <div className="card"><span className="lbl">Message</span><p style={{ marginTop: 6 }}>{b.message}</p></div>}
        {b.weeks
          ? <div className="kv"><span>Short stay · pays upfront</span><span className="num">{naira((b.weekly_price ?? 0) * b.weeks)}</span></div>
          : <div className="kv"><span>Pays monthly</span><span className="num">{naira(b.monthly_total)}</span></div>}
        <Err error={error} />
      </div>
      <Foot>
        {/* Accepting makes the agreement ready; a viewing first is optional. */}
        <button className="btn" disabled={!!busy || !b.deadline_at} onClick={() => run("accept")}>Accept</button>
        <button className="btn ghost" disabled={!!busy || !b.deadline_at} onClick={() => setPicking(true)}>Offer a viewing first</button>
        <button className="link" disabled={!!busy} onClick={() => run("decline")}>Decline</button>
      </Foot>
    </>
  );
}
