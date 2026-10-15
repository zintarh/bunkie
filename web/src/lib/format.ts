/** Room types in words. Self contain: own bathroom and kitchen, shared with nobody. */
export const ROOM_LABEL: Record<string, string> = { own_room: "Own room", shared_room: "Shared room", self_contain: "Self contain" };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function naira(n: number | null | undefined): string {
  return "₦" + Math.round(n ?? 0).toLocaleString("en-NG");
}

export function nairaK(n: number): string {
  return "₦" + Math.round(n / 1000) + "k";
}

export function months(n: number): string {
  return n + (n === 1 ? " month" : " months");
}

export function weeks(n: number): string {
  return n + (n === 1 ? " week" : " weeks");
}

/** "2 weeks" for a short stay, "3 months" otherwise. */
export function stayLength(s: { months: number | null; weeks?: number | null }): string {
  return s.weeks ? weeks(s.weeks) : months(s.months ?? 0);
}

export function stayRange(min: number, max: number): string {
  return min === max ? months(min) : `${min}–${max} months`;
}

/** "2026-11-01" -> Date at local midnight (avoids UTC shifts). */
export function parseDay(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

export function dayLabel(d: Date | string, withYear = false): string {
  const x = typeof d === "string" ? parseDay(d) : d;
  return `${DOW[x.getDay()]} ${x.getDate()} ${MON[x.getMonth()]}${withYear ? " " + x.getFullYear() : ""}`;
}

export function dayParts(d: Date) {
  return { dow: DOW[d.getDay()], num: d.getDate(), mon: MON[d.getMonth()] };
}

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`;
}

export function slotLabel(iso: string): string {
  return `${dayLabel(new Date(iso))}, ${timeLabel(iso)}`;
}

/** "in 5h", "in 40 min", "now" */
export function untilLabel(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)} days`;
}

export function initial(name: string | null | undefined): string {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

/** Badge text for a host whose corp member status is verified. */
export const CORPER_LABEL = { serving: "Corper host", served: "Ex-corper host" } as const;

/** Plain words for why a close match isn't exact (find_rooms misses). */
export function missLabel(m: import("./types").Miss): string {
  switch (m.kind) {
    case "over_budget": return `${nairaK(m.by)} over budget`;
    case "later": return `Free from ${dayLabel(m.on).slice(4)}`;
    case "farther": return `${m.minutes} min away`;
    case "room": return ROOM_LABEL[m.is];
    case "no_short": return "No short stays";
    case "min_stay": return `At least ${months(m.months)}`;
    case "max_stay": return `Up to ${months(m.months)}`;
  }
}

/** Inbox times: "14:05" today, "Yesterday", "Mon" this week, "12 Oct" before that. */
export function chatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (days === 0) return d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return DOW[d.getDay()];
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}

/** Day headings inside a chat: "Today", "Yesterday", "Mon 12 Oct". */
export function chatDay(iso: string): string {
  const t = chatTime(iso);
  if (t === "Yesterday") return t;
  return /\d:\d/.test(t) ? "Today" : dayLabel(new Date(iso));
}
