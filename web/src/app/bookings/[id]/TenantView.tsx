"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Camera, Check, CircleAlert, Home, KeyRound, MapPin, Navigation, PartyPopper, Phone, Video, Wallet } from "lucide-react";
import { CLOSE_REASON } from "@/lib/bunkie";
import { errorText } from "@/lib/auth";
import { roomTitle, type BookingFull } from "@/lib/bookings";
import { dayLabel, months, naira, slotLabel, timeLabel, untilLabel } from "@/lib/format";
import { callFunction } from "@/lib/functions";
import { shrinkFile } from "@/lib/image";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMyAnswers } from "@/lib/useMyAnswers";
import { AgreementParts, Err, Foot, PersonCard, Timeline, useStep } from "./shared";

type Props = { b: BookingFull; reload: () => Promise<void> };

export function TenantView({ b, reload }: Props) {
  const host = b.host.first_name;
  switch (b.status) {
    case "requested": case "accepted": return b.status === "accepted" ? <PickViewing b={b} reload={reload} /> : <Waiting b={b} reload={reload} />;
    case "viewing_booked": return <ViewingBooked b={b} reload={reload} />;
    case "viewed": return <AfterViewing b={b} reload={reload} />;
    case "host_confirmed": return <ConfirmAgreement b={b} reload={reload} />;
    case "agreed": return <Pay b={b} reload={reload} />;
    case "paid": return <Booked b={b} reload={reload} />;
    case "moved_in": case "active": case "ending": return <MyStay b={b} reload={reload} />;
    case "moved_out": case "completed": return <Simple title="Stay finished" text={`Thanks for bunking with ${host}.`} />;
    case "closed": return <Closed b={b} />;
  }
}

function Body({ children }: { children: React.ReactNode }) {
  return <div className="body open">{children}</div>;
}

function Simple({ title, text }: { title: string; text: string }) {
  return <Body><h1 className="h1">{title}</h1><p className="sub">{text}</p></Body>;
}

function Waiting({ b, reload }: Props) {
  const { busy, error, run } = useStep(b, reload);
  const waiting = !b.deadline_at;
  return (
    <>
      <Body>
        <h1 className="h1">{roomTitle(b)}</h1>
        <Timeline steps={[
          { title: "Request sent", sub: new Date(b.created_at).toLocaleString("en-NG", { weekday: "short", hour: "numeric", minute: "2-digit" }), state: "done" },
          { title: `Waiting for ${b.host.first_name}`, sub: waiting ? `${b.host.first_name} is talking to someone else first. You're next in line.` : `${b.host.first_name} has ${untilLabel(b.deadline_at)} to reply`, state: "now" },
          { title: "View the room", sub: b.is_camp_booking ? "Video call" : "In person or video call", state: "todo" },
          { title: "Agree and pay", state: "todo" },
        ]} />
        <Err error={error} />
      </Body>
      <Foot><button className="btn ghost" disabled={!!busy} onClick={() => run("withdraw")}>Cancel request</button></Foot>
    </>
  );
}

function PickViewing({ b, reload }: Props) {
  const { busy, error, run } = useStep(b, reload);
  const [mode, setMode] = useState<"in_person" | "video_call">(b.is_camp_booking ? "video_call" : "in_person");
  const [slot, setSlot] = useState<string | null>(null);
  const future = b.offered_slots.filter((s) => new Date(s) > new Date());
  const days = [...new Set(future.map((s) => new Date(s).toDateString()))];
  return (
    <>
      <Body>
        <h1 className="h1">Book a viewing</h1>
        <p className="small" style={{ fontSize: 15 }}>{b.host.first_name} accepted. Pick a time within {untilLabel(b.deadline_at)}.</p>
        {!b.is_camp_booking && (
          <div className="seg" role="radiogroup" aria-label="Viewing type">
            {(["in_person", "video_call"] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{m === "in_person" ? "In person" : "Video call"}</button>
            ))}
          </div>
        )}
        <span className="h2">Times {b.host.first_name} is free</span>
        {days.map((d) => (
          <div key={d} className="stack" style={{ gap: 8 }}>
            <span className="lbl">{dayLabel(new Date(d))}</span>
            <div className="chips">
              {future.filter((s) => new Date(s).toDateString() === d).map((s) => (
                <button key={s} className={slot === s ? "chip on" : "chip"} aria-pressed={slot === s} onClick={() => setSlot(s)}>{timeLabel(s)}</button>
              ))}
            </div>
          </div>
        ))}
        {future.length === 0 && <p className="small">The offered times have passed. Ask {b.host.first_name} for new ones by cancelling and requesting again.</p>}
        <Err error={error} />
      </Body>
      <Foot>
        <button className="btn" disabled={!slot || !!busy} onClick={() => run("book_viewing", { at: slot, mode })}>{busy ? <span className="spin" /> : "Book viewing"}</button>
        <button className="link" disabled={!!busy} onClick={() => run("withdraw")}>Cancel request</button>
      </Foot>
    </>
  );
}

function useAddress(id: string) {
  const [a, setA] = useState<{ address_line: string; landmark: string | null; lat: number; lng: number } | null>(null);
  useEffect(() => {
    supabaseBrowser()?.rpc("room_address", { p_booking: id }).then(({ data }) => setA(data?.[0] ?? null));
  }, [id]);
  return a;
}

function calendarFile(title: string, start: Date, minutes: number, where: string) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = new Date(start.getTime() + minutes * 60000);
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Bunkie//EN", "BEGIN:VEVENT", `UID:${start.getTime()}@bunkie`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:${title}`, `LOCATION:${where}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
}

function ViewingBooked({ b, reload }: Props) {
  const { busy, error, run } = useStep(b, reload);
  const addr = useAddress(b.id);
  const at = b.viewing_at ? new Date(b.viewing_at) : null;
  const started = at ? at.getTime() - 15 * 60000 < Date.now() : false;
  const video = b.viewing_mode === "video_call";
  return (
    <>
      <Body>
        <span className="tile t-mint" style={{ width: 52, height: 52, borderRadius: 999 }}><Check size={26} /></span>
        <h1 className="h1">Viewing booked</h1>
        <div className="card stack" style={{ gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 17 }}>{b.viewing_at ? slotLabel(b.viewing_at) : ""} · {video ? "video call" : "in person"}</span>
          {addr && (
            <div className="row" style={{ alignItems: "flex-start" }}>
              <MapPin size={20} color="var(--green)" style={{ flexShrink: 0 }} />
              <span className="stack" style={{ gap: 0 }}><span>{addr.address_line}</span><span className="small">{addr.landmark ?? `${b.listing.area_name}, Abuja`}</span></span>
            </div>
          )}
          {video ? <p className="small" style={{ fontSize: 14 }}>{b.host.first_name} will call you on WhatsApp at the time.</p> : addr && (
            <a className="btn ghost sm" href={`https://www.google.com/maps/dir/?api=1&destination=${addr.lat},${addr.lng}`} target="_blank" rel="noreferrer"><Navigation size={18} />Get directions</a>
          )}
          {at && (
            <a className="link" style={{ alignSelf: "flex-start" }} download="bunkie-viewing.ics"
              href={calendarFile(`Bunkie viewing with ${b.host.first_name}`, at, 30, addr?.address_line ?? b.listing.area_name)}>
              <CalendarPlus size={16} style={{ marginRight: 6 }} />Add to calendar
            </a>
          )}
        </div>
        {!video && <p className="note"><Phone size={16} style={{ flexShrink: 0, marginTop: 1 }} />Going alone? Share your live location with a friend on WhatsApp during the viewing.</p>}
        <div className="stack" style={{ gap: 0 }}>
          {b.reschedules < 1 && <button className="link" style={{ alignSelf: "flex-start" }} disabled={!!busy} onClick={() => run("reschedule")}>Reschedule</button>}
          {started && <button className="link" style={{ alignSelf: "flex-start" }} disabled={!!busy} onClick={() => run("no_show")}>{b.host.first_name} didn&apos;t show up</button>}
        </div>
        <Err error={error} />
      </Body>
      <Foot><button className="btn" disabled={!started || !!busy} onClick={() => run("viewing_done")}>I&apos;ve viewed the room</button></Foot>
    </>
  );
}

const OFF = ["Room looked different", "Price changed", "Rules changed", "Host was someone else"];

function AfterViewing({ b, reload }: Props) {
  const { busy, error, run } = useStep(b, reload);
  const [v, setV] = useState<"yes" | "no" | null>(null);
  const [why, setWhy] = useState<string[]>([]);
  if (b.tenant_matched_at) {
    return <Simple title={`Waiting for ${b.host.first_name}`} text={`${b.host.first_name} confirms the agreement first. You'll get a WhatsApp message.`} />;
  }
  return (
    <>
      <Body>
        <h1 className="h1">Did the room match the listing?</h1>
        <div role="radiogroup" aria-label="Did the room match" className="stack" style={{ gap: 10 }}>
          <button role="radio" aria-checked={v === "yes"} className={v === "yes" ? "opt on" : "opt"} onClick={() => setV("yes")}>Yes, it matched</button>
          <button role="radio" aria-checked={v === "no"} className={v === "no" ? "opt on" : "opt"} onClick={() => setV("no")}>No, something was off</button>
        </div>
        {v === "no" && (
          <div className="open stack">
            <span className="h2" style={{ fontSize: 16 }}>What was different?</span>
            <div className="chips">
              {OFF.map((o) => (
                <button key={o} className={why.includes(o) ? "chip on" : "chip"} aria-pressed={why.includes(o)}
                  onClick={() => setWhy(why.includes(o) ? why.filter((x) => x !== o) : [...why, o])}>{o}</button>
              ))}
            </div>
            <p className="small">You haven&apos;t paid anything.</p>
          </div>
        )}
        <Err error={error} />
      </Body>
      <Foot>
        {v === "no"
          ? <button className="btn red" disabled={why.length === 0 || !!busy} onClick={() => run("mismatch", { details: why.join(", ") })}>Decline and report</button>
          : <button className="btn" disabled={v !== "yes" || !!busy} onClick={() => run("matched")}>Continue to agreement</button>}
      </Foot>
    </>
  );
}

function ConfirmAgreement({ b, reload }: Props) {
  const { busy, error, run } = useStep(b, reload);
  const [ok, setOk] = useState(false);
  if (!b.agreement) return <Simple title="Agreement" text="Loading the terms…" />;
  return (
    <>
      <Body>
        <h1 className="h1">Agreement</h1>
        <div className="grid2">
          <div className="card row" style={{ padding: 12 }}><span className="avatar" style={{ width: 36, height: 36 }}>{b.host.first_name[0]}</span><span className="stack" style={{ gap: 0 }}><b style={{ fontSize: 14 }}>{b.host.first_name}</b><span className="small" style={{ color: "var(--green-text)", fontWeight: 700 }}>Confirmed</span></span></div>
          <div className="card row" style={{ padding: 12 }}><span className="avatar" style={{ width: 36, height: 36, background: "var(--green-soft)" }}>{b.tenant.first_name[0]}</span><span className="stack" style={{ gap: 0 }}><b style={{ fontSize: 14 }}>You</b><span className="small" style={{ fontWeight: 700 }}>{ok ? "Ready" : "Not yet"}</span></span></div>
        </div>
        <AgreementParts terms={b.agreement.terms} hostName={b.host.first_name} />
        <p className="small">Confirm within {untilLabel(b.deadline_at)}.</p>
        <Err error={error} />
      </Body>
      <Foot>
        <label className="check"><input type="checkbox" checked={ok} onChange={() => setOk(!ok)} />I agree to these terms</label>
        <button className="btn" disabled={!ok || !!busy} onClick={() => run("confirm_terms", { terms_hash: b.agreement!.terms_hash })}>Confirm</button>
      </Foot>
    </>
  );
}

function Pay({ b, reload }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = b.payments.find((p) => p.status === "pending");
  // Back from Paystack: keep checking until the webhook marks it paid.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("reference")) return;
    const t = setInterval(() => void reload(), 3000);
    return () => clearInterval(t);
  }, [reload]);

  const deposit = b.listing.deposit ?? 0;
  const rentPart = b.listing.pay_schedule === "lump_sum" ? b.monthly_total * b.months : b.monthly_total;
  const net = rentPart + deposit;
  const fee = pending ? pending.paystack_fee_kobo / 100 : null;

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await callFunction<{ authorization_url: string }>("paystack", { booking_id: b.id });
      window.location.href = r.authorization_url;
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <>
      <Body>
        <h1 className="h1">Pay</h1>
        <div className="card stack" style={{ gap: 10 }}>
          <div className="kv num"><span>{b.listing.pay_schedule === "lump_sum" ? `${months(b.months)} rent` : `First month (${dayLabel(b.move_in).slice(4)})`}</span><span>{naira(rentPart)}</span></div>
          {deposit > 0 && <div className="kv num"><span>Caution deposit</span><span>{naira(deposit)}</span></div>}
          {fee != null && <div className="kv num"><span>Paystack charge</span><span>{naira(fee)}</span></div>}
          <div className="divider" />
          <div className="kv num" style={{ fontWeight: 800, fontSize: 18 }}><span style={{ color: "var(--ink)" }}>Total</span><span>{naira(net + (fee ?? 0))}</span></div>
          <span className="small">{b.host.first_name} gets {naira(Math.round(net * 0.98))} after you move in · Bunkie fee 2%</span>
        </div>
        <div className="banner green"><Wallet size={20} style={{ flexShrink: 0 }} />Held by Paystack until you move in. Full refund if {b.host.first_name} cancels or the room isn&apos;t as listed.</div>
        <p className="note"><CircleAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />Only pay here. We never ask you to transfer to a personal account.</p>
        <p className="small">Pay within {untilLabel(b.deadline_at)} to lock the room.</p>
        <Err error={error} />
      </Body>
      <Foot><button className="btn" disabled={busy} onClick={pay}>{busy ? <span className="spin" /> : `Pay ${fee != null ? naira(net + fee) : ""}`.trim()}</button></Foot>
    </>
  );
}

const WINDOWS = [
  { value: "morning", label: "8am–11am" }, { value: "midday", label: "11am–2pm" },
  { value: "afternoon", label: "2pm–5pm" }, { value: "evening", label: "5pm–8pm" },
];

function Booked({ b, reload }: Props) {
  const { busy, error, run } = useStep(b, reload);
  const addr = useAddress(b.id);
  const paid = b.payments.find((p) => p.status === "success");
  const today = new Date().toISOString().slice(0, 10);
  const [checkIn, setCheckIn] = useState(false);
  if (checkIn || today >= b.move_in) return <CheckIn b={b} reload={reload} />;
  return (
    <>
      <Body>
        <span className="tile t-mint" style={{ width: 56, height: 56, borderRadius: 999 }}><PartyPopper size={28} /></span>
        <h1 className="h1">You and {b.host.first_name} are bunkies</h1>
        <div className="lrows">
          <div className="lrow"><span className="tile t-mint"><Home size={20} /></span><span className="stack" style={{ gap: 0 }}><b>Move in {dayLabel(b.move_in)}</b><span className="small">{addr?.address_line ?? b.listing.area_name}</span></span></div>
          {paid && <div className="lrow"><span className="tile t-amber"><Wallet size={20} /></span><span className="stack" style={{ gap: 0 }}><b>{naira((paid.amount_kobo + paid.paystack_fee_kobo) / 100)} paid</b><span className="small">Held until move-in · {paid.paystack_reference}</span></span></div>}
        </div>
        <span className="h2">When will you arrive?</span>
        <div className="chips" role="radiogroup" aria-label="Arrival time">
          {WINDOWS.map((w) => (
            <button key={w.value} role="radio" aria-checked={b.arrival_window === w.value} className={b.arrival_window === w.value ? "chip on" : "chip"}
              disabled={!!busy} onClick={() => run("plan_arrival", { window: w.value })}>{w.label}</button>
          ))}
        </div>
        {b.arrival_window && <p className="small">{b.host.first_name} has been told. We&apos;ll remind you both on WhatsApp that morning.</p>}
        <Err error={error} />
      </Body>
      <Foot><button className="btn ghost" onClick={() => setCheckIn(true)}>I&apos;m at the room</button></Foot>
    </>
  );
}

const SHOTS = ["Walls and floor", "Wardrobe", "Bathroom"];

function CheckIn({ b, reload }: Props) {
  const { busy, error, run, setError } = useStep(b, reload);
  const [phase, setPhase] = useState<"ask" | "problem" | "keys">("ask");
  const [problem, setProblem] = useState<"not_as_listed" | "cant_get_in">("not_as_listed");
  const [details, setDetails] = useState("");
  const [keys, setKeys] = useState(false);
  const [shots, setShots] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<string>("");

  const upload = async (file: File) => {
    const db = supabaseBrowser();
    if (!db) return;
    setUploading(target.current);
    try {
      const img = await shrinkFile(file, 1600, 0.8);
      const path = `${b.id}/move_in-${crypto.randomUUID()}.${img.ext}`;
      const up = await db.storage.from("condition").upload(path, img.blob, { contentType: img.blob.type });
      if (up.error) throw up.error;
      const { data: u } = await db.auth.getUser();
      const ins = await db.from("condition_photos").insert({ booking_id: b.id, phase: "move_in", path, uploaded_by: u.user!.id });
      if (ins.error) throw ins.error;
      setShots((s) => ({ ...s, [target.current]: true }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(null);
    }
  };

  if (phase === "problem") {
    return (
      <>
        <Body>
          <div className="banner green"><Wallet size={20} />Your payment is still held</div>
          <h1 className="h1">{problem === "cant_get_in" ? "We'll get you in" : "We'll sort this out"}</h1>
          <label className="field" style={{ alignItems: "flex-start" }}>
            <span className="sr-only">What happened</span>
            <textarea rows={4} placeholder="What happened?" value={details} onChange={(e) => setDetails(e.target.value)} />
          </label>
          <Link className="btn ghost sm" href="/explore"><Home size={18} />Rooms free tonight</Link>
          <Err error={error} />
        </Body>
        <Foot><button className="btn red" disabled={!!busy} onClick={() => run("check_in", { as_listed: false, problem, details })}>Report and get a refund</button></Foot>
      </>
    );
  }
  if (phase === "keys") {
    const done = SHOTS.every((s) => shots[s]);
    return (
      <>
        <Body>
          <h1 className="h1">Check in</h1>
          <label className="opt" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={keys} onChange={() => setKeys(!keys)} style={{ width: 22, height: 22, accentColor: "var(--green-text)" }} />
            <KeyRound size={20} />I&apos;ve got the keys
          </label>
          <span className="h2">Photos of the room</span>
          <span className="small">These protect your caution deposit at move-out.</span>
          <div className="grid2" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
            {SHOTS.map((s) => (
              <button key={s} className={shots[s] ? "opt on" : "opt"} style={{ flexDirection: "column", justifyContent: "center", minHeight: 96, gap: 6, padding: 8, fontSize: 13, textAlign: "center" }}
                onClick={() => { target.current = s; input.current?.click(); }} disabled={!!uploading}>
                {uploading === s ? <span className="spin dark" /> : shots[s] ? <Check size={22} color="var(--green)" /> : <Camera size={22} />}{s}
              </button>
            ))}
          </div>
          <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          <Err error={error} />
        </Body>
        <Foot><button className="btn" disabled={!keys || !done || !!busy} onClick={() => run("check_in", { as_listed: true })}>Confirm move-in</button></Foot>
      </>
    );
  }
  return (
    <>
      <Body>
        <h1 className="h1">You&apos;re at the room</h1>
        <p className="sub">{dayLabel(b.move_in)} · {b.listing.area_name} with {b.host.first_name}</p>
        <span className="h2">Is everything as listed?</span>
        <div className="stack" style={{ gap: 10 }}>
          <button className="opt" onClick={() => setPhase("keys")}><span className="ico"><Check size={20} /></span>Yes, all good</button>
          <button className="opt" onClick={() => { setProblem("not_as_listed"); setPhase("problem"); }}><span className="ico"><CircleAlert size={20} /></span>Something&apos;s different</button>
          <button className="opt" onClick={() => { setProblem("cant_get_in"); setPhase("problem"); }}><span className="ico"><KeyRound size={20} /></span>I can&apos;t get in</button>
        </div>
      </Body>
    </>
  );
}

function MyStay({ b, reload }: Props) {
  const { busy, error, run } = useStep(b, reload);
  const myAnswers = useMyAnswers();
  const [leaving, setLeaving] = useState(false);
  const start = new Date(b.move_in).getTime();
  const end = new Date(b.move_out).getTime();
  const day = Math.max(1, Math.ceil((Date.now() - start) / 86400000));
  const total = Math.round((end - start) / 86400000);
  return (
    <>
      <Body>
        <h1 className="h1">My stay</h1>
        <div className="card stack" style={{ gap: 10 }}>
          <span style={{ fontWeight: 700 }}>{roomTitle(b)}</span>
          <span className="small">With {b.host.first_name} · Day {Math.min(day, total)} of {total} · Ends {dayLabel(b.move_out)}</span>
          <span className="progress" style={{ borderRadius: 4 }}><span style={{ width: `${Math.min(100, (day / total) * 100)}%`, borderRadius: 4 }} /></span>
        </div>
        {b.status === "moved_in" && <div className="banner amber">Waiting for {b.host.first_name} to confirm you moved in.</div>}
        {b.status === "ending" && <div className="banner amber">Your last night is {dayLabel(new Date(new Date(b.move_out).getTime() - 86400000))}.</div>}
        <div className="lrows">
          <Link className="lrow" href="/ppa"><span className="tile t-mint"><MapPin size={20} /></span><span className="stack" style={{ gap: 0 }}><b>Got your PPA? Add it</b><span className="small">See your commute.</span></span></Link>
          <Link className="lrow" href={`/help?booking=${b.id}`}><span className="tile t-coral"><CircleAlert size={20} /></span>Get help</Link>
          {b.status === "active" && (
            <button className="lrow" onClick={() => setLeaving(true)}><span className="tile t-amber"><Video size={20} /></span>Leaving early or redeployed</button>
          )}
          {b.status === "ending" && (
            <button className="lrow" disabled={!!busy} onClick={() => run("move_out_done")}><span className="tile t-sky"><Home size={20} /></span>I&apos;ve moved out</button>
          )}
        </div>
        {leaving && (
          <div className="card stack open" style={{ gap: 10 }}>
            <span className="h2">Leave with notice</span>
            <span className="small" style={{ fontSize: 14 }}>Your last night is set by the notice in your agreement. Unused months come back to you.</span>
            <button className="btn red sm" disabled={!!busy} onClick={() => run("end_early")}>Give notice</button>
            <button className="link" onClick={() => setLeaving(false)}>Stay</button>
          </div>
        )}
        <PersonCard p={b.host} sub="Your bunkie" myAnswers={myAnswers} />
        <Err error={error} />
      </Body>
    </>
  );
}

function Closed({ b }: { b: BookingFull }) {
  const refund = b.refunds[0];
  return (
    <>
      <Body>
        <h1 className="h1">{roomTitle(b)}</h1>
        <div className="banner red">{CLOSE_REASON[b.close_reason ?? ""] ?? "This booking is closed."}</div>
        {refund && <div className="banner green"><Wallet size={20} />{naira(refund.amount_kobo / 100)} refund {refund.status === "done" ? "sent" : "on its way"}</div>}
      </Body>
      <Foot><Link className="btn" href="/explore">See similar rooms</Link></Foot>
    </>
  );
}
