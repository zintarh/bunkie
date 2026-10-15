"use client";
import Link from "next/link";
import { Award, BadgeCheck, CalendarDays, CircleAlert, Clock, Eye, Heart } from "lucide-react";
import { HOUSEHOLD_LABEL } from "@/lib/bunkie";
import { CORPER_LABEL, missLabel, naira, ROOM_LABEL, stayRange } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import type { RoomCard as Room } from "@/lib/types";

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
  const title = `${kind} in ${room.area_name} with ${room.host_first_name}`;
  return (
    <article className="rcard">
      <Link href={`/rooms/${room.id}`} aria-label={title} className="photo"
        style={{ position: "relative", display: "block", height: 200, borderRadius: 18, backgroundImage: `url(${photoUrl(room.cover_path)})` }}>
        {room.host_corper === "serving" || room.host_corper === "served" ? (
          <span className="badge verified" style={{ position: "absolute", left: 10, top: 10, color: "var(--amber-text)" }}>
            <Award size={14} strokeWidth={2.4} />{CORPER_LABEL[room.host_corper]}
          </span>
        ) : room.host_verified && (
          <span className="badge verified" style={{ position: "absolute", left: 10, top: 10 }}>
            <BadgeCheck size={14} strokeWidth={2.4} />Verified host
          </span>
        )}
        {room.being_viewed_until && new Date(room.being_viewed_until) > new Date() && (
          <span className="badge" style={{ position: "absolute", right: 10, bottom: 10, background: "var(--amber)", color: "var(--ink)" }}>
            <Eye size={13} strokeWidth={2.4} />Being viewed
          </span>
        )}
        <span className="badge dark" style={{ position: "absolute", left: 10, bottom: 10 }}>
          <CalendarDays size={13} strokeWidth={2.4} />{stayRange(room.min_months, room.max_months)}
        </span>
      </Link>
      <button className="heart" onClick={onToggleSave} aria-label={saved ? "Remove from saved" : "Save room"} aria-pressed={saved}>
        <Heart size={20} strokeWidth={2.2} fill={saved ? "#E5484D" : "none"} color={saved ? "#E5484D" : "#FFFFFF"} />
      </button>
      <Link href={`/rooms/${room.id}`} style={{ display: "flex", flexDirection: "column", gap: 3, color: "var(--ink)", padding: "0 8px 8px" }}>
        <span className="between">
          <span className="num price" style={{ fontSize: 21 }}>
            {room.total_varies ? <span style={{ fontFamily: "var(--body)", fontWeight: 500, fontSize: 14, color: "var(--muted)", letterSpacing: 0 }}>about </span> : null}
            {naira(room.monthly_total)}
            <span style={{ fontFamily: "var(--body)", fontWeight: 500, fontSize: 14, color: "var(--muted)", letterSpacing: 0 }}> /month</span>
          </span>
          {minutesLabel && <span className="mins"><Clock size={14} strokeWidth={2.6} />{minutesLabel}</span>}
        </span>
        <span style={{ fontSize: 14 }}>{kind} in {room.area_name} · {room.host_first_name}</span>
        <span style={{ fontSize: 14, color: "var(--muted)" }}>
          {HOUSEHOLD_LABEL[room.household]} household{room.furnished ? " · Furnished" : ""}
          {fitScore != null ? ` · ${fitScore}% bunkie fit` : ""}
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
