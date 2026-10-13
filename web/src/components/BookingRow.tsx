"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CLOSE_REASON } from "@/lib/bunkie";
import { roomTitle, type BookingFull } from "@/lib/bookings";
import { dayLabel, untilLabel } from "@/lib/format";
import { photoUrl } from "@/lib/photos";

export function statusLine(b: BookingFull, role: "tenant" | "host"): { text: string; tone: "green" | "amber" | "grey" | "red" } {
  const other = role === "tenant" ? b.host.first_name : b.tenant.first_name;
  const by = b.deadline_at ? ` · ${untilLabel(b.deadline_at)} left` : "";
  switch (b.status) {
    case "requested": return role === "tenant" ? { text: `Waiting for ${other}${by}`, tone: "amber" } : { text: `New request · reply${by}`, tone: "amber" };
    case "accepted": return role === "tenant" ? { text: `Pick a viewing time${by}`, tone: "green" } : { text: `Waiting for ${other} to pick a time`, tone: "grey" };
    case "viewing_booked": return { text: `Viewing ${b.viewing_at ? dayLabel(new Date(b.viewing_at)) : ""}`, tone: "green" };
    case "viewed": return { text: role === "tenant" && !b.tenant_matched_at ? "Did the room match?" : role === "host" && b.tenant_matched_at ? "Confirm the agreement" : `Waiting for ${other}`, tone: "amber" };
    case "host_confirmed": return role === "tenant" ? { text: `Confirm the agreement${by}`, tone: "amber" } : { text: `Waiting for ${other} to confirm`, tone: "grey" };
    case "agreed": return role === "tenant" ? { text: `Pay to lock the room${by}`, tone: "amber" } : { text: "Waiting for payment", tone: "grey" };
    case "paid": return { text: `Booked · move in ${dayLabel(b.move_in)}`, tone: "green" };
    case "moved_in": case "active": return { text: "Living here", tone: "green" };
    case "ending": return { text: `Last night ${dayLabel(b.move_out)}`, tone: "amber" };
    case "moved_out": case "completed": return { text: "Stay finished", tone: "grey" };
    case "closed": return { text: CLOSE_REASON[b.close_reason ?? ""] ?? "Closed", tone: "red" };
  }
}

export function BookingRow({ b, role }: { b: BookingFull; role: "tenant" | "host" }) {
  const s = statusLine(b, role);
  return (
    <Link href={`/bookings/${b.id}`} className="card row" style={{ padding: 10, gap: 12, color: "var(--ink)" }}>
      <span className="photo" style={{ width: 64, height: 64, borderRadius: 14, flexShrink: 0, backgroundImage: `url(${photoUrl(b.listing.cover_path)})` }} />
      <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700 }}>{role === "tenant" ? roomTitle(b) : `${b.tenant.first_name} · ${b.listing.area_name}`}</span>
        <span className="small">{role === "tenant" ? `With ${b.host.first_name} · ` : ""}{dayLabel(b.move_in)} – {dayLabel(b.move_out)}</span>
        <span className={`badge ${s.tone}`} style={{ alignSelf: "flex-start", marginTop: 4 }}>{s.text}</span>
      </span>
      <ChevronRight size={18} color="var(--muted)" />
    </Link>
  );
}

