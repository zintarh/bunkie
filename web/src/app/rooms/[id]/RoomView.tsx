"use client";
import Link from "next/link";
import { MapImage } from "@/components/MapImage";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Award, BadgeCheck, Bath, Eye, CalendarDays, ChevronLeft, Clock, Flag, Heart, Info, MessageCircle, Share2, Tent, Wallet } from "lucide-react";
import { useToast } from "@/components/ui";
import { errorText, useMe } from "@/lib/auth";
import { openChat } from "@/lib/chat";
import { qs } from "@/lib/url";
import { HOUSEHOLD_LABEL, QUESTIONS, fit } from "@/lib/bunkie";
import { CORPER_LABEL, dayLabel, initial, naira, ROOM_LABEL, stayRange } from "@/lib/format";
import { avatarUrl, photoUrl } from "@/lib/photos";
import { usePrefs } from "@/lib/prefs";
import { useSaved } from "@/lib/saved";
import { estimateMinutes } from "@/lib/estimate";
import { useMyAnswers } from "@/lib/useMyAnswers";
import type { RoomDetail } from "@/lib/types";
import styles from "./room.module.css";

const REDEPLOY = { all_unused: "Unused months back", unused_minus_2w: "Unused months, minus 2 weeks" };
const SHOT = { bedroom: "Bedroom", bathroom: "Bathroom", kitchen: "Kitchen", meter: "Prepaid meter", entrance: "Entrance", extra: "Room" };

export function RoomView({ room }: { room: RoomDetail }) {
  const router = useRouter();
  const [prefs] = usePrefs();
  const [saved, toggleSave] = useSaved();
  const myAnswers = useMyAnswers();
  const [photo, setPhoto] = useState(0);
  const [showCosts, setShowCosts] = useState(false);
  const [toast, showToast] = useToast();
  const [me] = useMe();
  const [opening, setOpening] = useState(false);
  const isDemo = room.id.startsWith("demo-");

  // Opens the chat with this host (signed out: sign up first, then come back here).
  const message = async () => {
    if (!me) return router.push(`/signup?next=${qs(`/rooms/${room.id}`)}`);
    setOpening(true);
    try {
      router.push(`/inbox/${await openChat(room.id)}`);
    } catch (e) {
      setOpening(false);
      showToast(errorText(e));
    }
  };

  const photos = room.photos.length ? room.photos : [{ path: room.cover_path ?? "", shot: "bedroom" as const, taken_at: "" }];
  const n = photos.length;
  const isSaved = saved.has(room.id);
  const kind = ROOM_LABEL[room.room_kind];
  const inCamp = prefs.stage === "in_camp";
  const commute = !inCamp && prefs.ppa && room.area_lat != null
    ? estimateMinutes(room.area_lat, room.area_lng!, prefs.ppa.lat, prefs.ppa.lng) : null;
  const match = fit(myAnswers, room.host_answers);
  const takenOn = photos[0]?.taken_at ? new Date(photos[0].taken_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" }) : null;

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${kind} in ${room.area_name}`, url });
      else {
        await navigator.clipboard.writeText(url);
        showToast("Link copied");
      }
    } catch {
      // Share sheet dismissed.
    }
  };

  return (
    <main className="screen">
      <div className="body" style={{ padding: 0, gap: 0 }}>
        <div className="photo" style={{ height: 300, position: "relative", flexShrink: 0, backgroundImage: `url(${photoUrl(photos[photo].path, 1080)})` }}>
          <button className={styles.tapL} onClick={() => setPhoto((photo + n - 1) % n)} aria-label="Previous photo" />
          <button className={styles.tapR} onClick={() => setPhoto((photo + 1) % n)} aria-label="Next photo" />
          <div className="between" style={{ position: "absolute", left: 16, right: 16, top: 12 }}>
            <button className="fab" onClick={() => (history.length > 1 ? router.back() : router.push("/explore"))} aria-label="Back"><ChevronLeft size={22} strokeWidth={2.4} /></button>
            <div className="row" style={{ gap: 10 }}>
              <button className="fab" onClick={share} aria-label="Share"><Share2 size={18} strokeWidth={2.2} /></button>
              <button className="fab" onClick={() => toggleSave(room.id)} aria-label={isSaved ? "Remove from saved" : "Save room"} aria-pressed={isSaved}>
                <Heart size={18} strokeWidth={2.2} fill={isSaved ? "#E5484D" : "none"} color={isSaved ? "#E5484D" : "#10231B"} />
              </button>
            </div>
          </div>
          <div style={{ position: "absolute", left: 16, right: 16, bottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="between">
              <span className="badge dark">{SHOT[photos[photo].shot]}{takenOn ? ` · taken in the app · ${takenOn}` : ""}</span>
              <span className="badge dark num">{photo + 1} / {n}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
              {photos.map((p, i) => <span key={p.path + i} className={styles.dot} style={{ background: i === photo ? "#fff" : "rgba(255,255,255,.5)" }} />)}
            </div>
          </div>
        </div>

        <section className={styles.sec} style={{ gap: 4 }}>
          <h1 className="h1">{kind} in a {HOUSEHOLD_LABEL[room.household].toLowerCase()} household</h1>
          <span className="muted" style={{ fontSize: 15 }}>{room.area_name}, Abuja</span>
          {room.open_to_camp && (
            <span className="badge green" style={{ alignSelf: "flex-start", marginTop: 8, fontSize: 13 }}><Tent size={14} strokeWidth={2.4} />Open to camp bookings</span>
          )}
        </section>

        <section className={styles.sec} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <Fact icon={<Clock size={20} color="var(--green)" strokeWidth={2.2} />}
            value={commute != null ? `${commute} min` : room.ease_min != null ? `${room.ease_min} min` : "—"}
            label={commute != null ? "to your PPA" : "to the city centre"} />
          <Fact icon={<CalendarDays size={20} color="var(--green)" strokeWidth={2.2} />} value={stayRange(room.min_months, room.max_months)} label="stay length" />
          <Fact icon={<CalendarDays size={20} color="var(--green)" strokeWidth={2.2} />} value={room.available_from ? dayLabel(room.available_from).slice(4) : "Now"} label="move in from" />
          <Fact icon={<Bath size={20} color="var(--green)" strokeWidth={2.2} />} value={room.bath_kind === "own" ? "Own" : "Shared"} label="bathroom" />
        </section>

        <section className={styles.sec} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <span className="avatar" style={{ width: 52, height: 52, fontSize: 20 }}>
            {avatarUrl(room.host_photo_path) ? <img src={avatarUrl(room.host_photo_path)!} alt="" /> : initial(room.host_first_name)}
          </span>
          <span className="stack" style={{ gap: 3, flex: 1 }}>
            <span className="row" style={{ gap: 6, fontWeight: 700 }}>Hosted by {room.host_first_name}{room.host_verified && <BadgeCheck size={18} color="var(--green)" strokeWidth={2.4} aria-label="Verified" />}</span>
            <span className="small" style={{ fontSize: 14 }}>Lives here</span>
            {(room.host_corper === "serving" || room.host_corper === "served") && (
              <span className="badge amber" style={{ alignSelf: "flex-start", marginTop: 2 }}><Award size={13} strokeWidth={2.4} />{CORPER_LABEL[room.host_corper]}</span>
            )}
          </span>
          {!isDemo && me?.user.id !== room.host_id && (
            <button className="pill" onClick={message} disabled={opening} style={{ flexShrink: 0 }}>
              {opening ? <span className="spin dark" /> : <><MessageCircle size={16} />Message</>}
            </button>
          )}
        </section>

        {room.host_answers && (
          <section className={styles.sec}>
            <div className="between">
              <span className="h2">Living with {room.host_first_name}</span>
              {match && <span className="mins">{match.score}% fit</span>}
            </div>
            {QUESTIONS.map((q) => (
              <div key={q.key} className="kv">
                <span>{q.topic}</span><span style={{ textAlign: "right" }}>{q.summary[room.host_answers![q.key]]}</span>
              </div>
            ))}
            {match && match.matches.length > 0 && (
              <span className="small">You line up on {match.matches.join(", ")}.</span>
            )}
          </section>
        )}

        {room.being_viewed_until && new Date(room.being_viewed_until) > new Date() && (
          <section className={styles.sec} style={{ gap: 0 }}>
            <div className="banner amber" style={{ alignItems: "flex-start" }}>
              <Eye size={20} style={{ flexShrink: 0 }} />
              <span>Someone is inspecting this room until {dayLabel(new Date(room.being_viewed_until))}. You can still request it and you&apos;ll be next in line.</span>
            </div>
          </section>
        )}

        <section className={styles.sec} style={{ gap: 12 }}>
          <span className="h2">What you pay</span>
          <div className="between" style={{ alignItems: "baseline" }}>
            <span style={{ fontSize: 15 }}>Every month</span>
            <span className="num" style={{ fontWeight: 800, fontSize: 20 }}>{room.total_varies ? "about " : ""}{naira(room.monthly_total)}</span>
          </div>
          <div className="between" style={{ alignItems: "baseline" }}>
            <span style={{ fontSize: 15 }}>Inspection</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{room.inspection_fee ? `${naira(room.inspection_fee)}, counts toward rent` : "Free"}</span>
          </div>
          {room.open_to_short && room.weekly_price ? (
            <div className="between" style={{ alignItems: "baseline" }}>
              <span style={{ fontSize: 15 }}>Short stay, 1–4 weeks</span>
              <span className="num" style={{ fontWeight: 800, fontSize: 17 }}>{naira(room.weekly_price)}<span className="muted" style={{ fontWeight: 500, fontSize: 14 }}> /week</span></span>
            </div>
          ) : null}
          {showCosts && (
            <div className="open stack soft" style={{ gap: 8 }}>
              <div className="kv num" style={{ fontSize: 14 }}><span>Rent share</span><span>{naira(room.rent_monthly)}</span></div>
              {room.costs.map((c) => (
                <div key={c.name} className="kv num" style={{ fontSize: 14 }}>
                  <span>{c.name}{c.varies ? " (varies)" : ""}</span>
                  <span>{c.tenant_pays ? `${c.varies ? "about " : ""}${naira(c.amount)}` : "Included"}</span>
                </div>
              ))}
            </div>
          )}
          <button className="link" style={{ alignSelf: "flex-start", height: 36, padding: 0, fontSize: 14 }} onClick={() => setShowCosts(!showCosts)} aria-expanded={showCosts}>
            {showCosts ? "Hide breakdown" : "See breakdown"}
          </button>
          {room.deposit ? (
            <div className="between" style={{ alignItems: "baseline", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              <span style={{ fontSize: 15 }}>Caution deposit <span className="muted">· once, refundable</span></span>
              <span className="num" style={{ fontWeight: 700 }}>{naira(room.deposit)}</span>
            </div>
          ) : null}
          <div className="note"><Wallet size={16} style={{ flexShrink: 0, marginTop: 1 }} />Held until you move in.</div>
        </section>

        {room.rules.length > 0 && (
          <section className={styles.sec} style={{ gap: 4 }}>
            <span className="h2" style={{ marginBottom: 6 }}>House rules</span>
            {room.rules.map((r) => (
              <div key={r.topic} className={styles.rr}><Info size={18} color="var(--muted)" strokeWidth={2.2} /><span style={{ fontSize: 15 }}>{r.topic}: {r.choice}</span></div>
            ))}
          </section>
        )}

        <section className={styles.sec} style={{ gap: 4 }}>
          <span className="h2" style={{ marginBottom: 6 }}>Refunds</span>
          <div className={styles.rr} style={{ justifyContent: "space-between" }}><span style={{ fontSize: 15 }}>You leave early</span><span className="small" style={{ fontSize: 14 }}>{room.early_leave_notice_days} days&apos; notice</span></div>
          <div className={styles.rr} style={{ justifyContent: "space-between" }}><span style={{ fontSize: 15 }}>You&apos;re redeployed</span><span className="small" style={{ fontSize: 14 }}>{REDEPLOY[room.redeploy_refund]}</span></div>
          <div className={styles.rr} style={{ justifyContent: "space-between" }}><span style={{ fontSize: 15 }}>Host asks you to leave</span><span className="small" style={{ fontSize: 14 }}>Unused months back</span></div>
        </section>

        <section className={styles.sec} style={{ gap: 12 }}>
          <span className="h2">Where you&apos;ll be</span>
          {room.area_lat != null && room.area_lng != null
            ? <MapImage lat={room.area_lat} lng={room.area_lng} mode="area" label={`Map around ${room.area_name}`} />
            : <MapImage lat={9.0579} lng={7.4951} mode="area" zoom={12} label="Map of Abuja" />}
          <span className="small" style={{ fontSize: 14 }}>
            {room.area_name}. Exact address shared when your viewing is booked.
            {room.area_lat != null && (
              <> <a href={`https://www.google.com/maps/search/?api=1&query=${room.area_lat},${room.area_lng}`} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Open area in Maps</a></>
            )}
          </span>
        </section>

        <div style={{ padding: "16px 20px 24px" }}>
          <Link href={`/help?listing=${room.id}`} className="row" style={{ gap: 8, minHeight: 44, fontWeight: 700, fontSize: 14, color: "var(--ink)", textDecoration: "underline" }}>
            <Flag size={16} strokeWidth={2.2} />Report this listing
          </Link>
        </div>
      </div>

      <div className="foot" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span className="stack" style={{ gap: 0, flexShrink: 0 }}>
          <span className="num" style={{ fontWeight: 800, fontSize: 18 }}>{naira(room.monthly_total)}<span className="muted" style={{ fontWeight: 500, fontSize: 14 }}> /month</span></span>
          <span className="small">₦0 to request</span>
        </span>
        <Link className="btn" style={{ maxWidth: 200 }} href={`/request/${room.id}`}>Request</Link>
      </div>
      {toast}
    </main>
  );
}

function Fact({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className={styles.fact}>
      {icon}<b>{value}</b><span>{label}</span>
    </div>
  );
}
