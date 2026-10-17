"use client";
import Link from "next/link";
import { Award, BadgeCheck, CalendarDays, CircleAlert, Clock, Eye, Heart, Star } from "lucide-react";
import { HOUSEHOLD_LABEL, QUESTIONS } from "@/lib/bunkie";
import { CORPER_LABEL, initial, missLabel, naira, ROOM_LABEL, stayRange } from "@/lib/format";
import { avatarUrl, photoUrl } from "@/lib/photos";
import type { RoomCard as Room } from "@/lib/types";

/** A bunkie first, their place second: who you'd live with leads, the room supports. */
export function RoomCard({
  room, saved, onToggleSave, minutesLabel, fitScore,
}: {
  room: Room;
  saved: boolean;
  onToggleSave: () => void;
  minutesLabel?: string | null;
  fitScore?: number | null;
}) {
  const kind = ROOM_LABEL[room.room_kind];
  const href = `/rooms/${room.id}`;
  const corper = room.host_corper === "serving" || room.host_corper === "served" ? room.host_corper : null;
  const photo = avatarUrl(room.host_photo_path);
  // Two everyday habits (sleep, guests) say more about living together than a room spec.
  const habits = room.host_answers ? [QUESTIONS[0], QUESTIONS[1]].map((q) => q.summary[room.host_answers![q.key]]).filter(Boolean) : [];

  return (
    <article className="rcard">
      <Link href={href} className="bhead" aria-label={`Bunk with ${room.host_first_name} in ${room.area_name}`}>
        <span className="avatar" style={{ width: 52, height: 52, fontSize: 21 }}>
          {photo ? <img src={photo} alt="" /> : initial(room.host_first_name)}
        </span>
        <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
          <span className="bname">{room.host_first_name}</span>
          {corper ? (
            <span className="btag" style={{ color: "var(--amber-text)" }}><Award size={14} strokeWidth={2.4} />{CORPER_LABEL[corper]}</span>
          ) : room.host_verified ? (
            <span className="btag" style={{ color: "var(--green-text)" }}><BadgeCheck size={14} strokeWidth={2.4} />Verified host</span>
          ) : null}
        </span>
        {fitScore != null && <span className="bfit">{fitScore}% fit</span>}
      </Link>
      {habits.length > 0 && <span className="bhabits">{habits.join(" · ")}</span>}

      <div style={{ position: "relative" }}>
        <Link href={href} tabIndex={-1} aria-hidden="true" className="photo"
          style={{ position: "relative", display: "block", height: 170, borderRadius: 18, backgroundImage: `url(${photoUrl(room.cover_path)})` }}>
          {room.being_viewed_until && new Date(room.being_viewed_until) > new Date() && (
            <span className="badge" style={{ position: "absolute", right: 10, bottom: 10, background: "var(--amber)", color: "var(--ink)" }}>
              <Eye size={13} strokeWidth={2.4} />Being viewed
            </span>
          )}
          <span className="badge dark" style={{ position: "absolute", left: 10, bottom: 10 }}>
            <CalendarDays size={13} strokeWidth={2.4} />{stayRange(room.min_months, room.max_months)}
          </span>
        </Link>
        <button className="heart" style={{ right: 10, top: 10 }} onClick={onToggleSave} aria-label={saved ? `Remove ${room.host_first_name} from saved` : `Save ${room.host_first_name}`} aria-pressed={saved}>
          <Heart size={20} strokeWidth={2.2} fill={saved ? "#E5484D" : "none"} color={saved ? "#E5484D" : "#FFFFFF"} />
        </button>
      </div>

      <Link href={href} tabIndex={-1} style={{ display: "flex", flexDirection: "column", gap: 3, color: "var(--ink)", padding: "0 8px 8px" }}>
        <span className="between">
          <span style={{ fontSize: 15, fontWeight: 600 }}>{kind} in {room.area_name}</span>
          {minutesLabel && <span className="mins"><Clock size={14} strokeWidth={2.6} />{minutesLabel}</span>}
        </span>
        <span className="row" style={{ fontSize: 14, gap: 6 }}>
          <span className="num">
            {room.total_varies ? "about " : ""}<b>{naira(room.monthly_total)}</b><span className="muted"> /month</span>
          </span>
          <span className="row" style={{ gap: 3, marginLeft: "auto", fontWeight: 700 }}>
            <Star size={14} fill="var(--amber)" color="var(--amber)" />
            {room.rating_count ? <>{Number(room.rating_avg).toFixed(1)}<span className="muted" style={{ fontWeight: 500 }}>({room.rating_count})</span></> : "New"}
          </span>
        </span>
        <span style={{ fontSize: 14, color: "var(--muted)" }}>
          {HOUSEHOLD_LABEL[room.household]} household{room.furnished ? " · Furnished" : ""}
        </span>
        {room.misses && room.misses.length > 0 && (
          <span className="row" style={{ gap: 6, fontSize: 14, fontWeight: 600, color: "var(--amber-text)" }}>
            <CircleAlert size={15} strokeWidth={2.4} style={{ flexShrink: 0 }} />{room.misses.map(missLabel).join(" · ")}
          </span>
        )}
        {room.open_to_short && room.weekly_price ? (
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--green-text)" }}>Short stays from {naira(room.weekly_price)}/week</span>
        ) : null}
      </Link>
    </article>
  );
}
