"use client";
import { useMemo, useState } from "react";
import { dayParts, isoDay, slotLabel, timeLabel } from "@/lib/format";

const HOURS = [9, 11, 13, 15, 17, 19];

/** Viewing times over the next few days: a day strip, then hours. Times within the hour are left out. */
export function SlotPicker({ slots, onChange, max }: { slots: string[]; onChange: (s: string[]) => void; max: number }) {
  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 5 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i + (now.getHours() >= 18 ? 1 : 0)));
  }, []);
  const [day, setDay] = useState(isoDay(days[0]));
  const toggle = (iso: string) => onChange(slots.includes(iso) ? slots.filter((x) => x !== iso) : [...slots, iso].slice(-max));
  const [y, m, d] = day.split("-").map(Number);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="chips scroll" role="radiogroup" aria-label="Day">
        {days.map((dt) => {
          const p = dayParts(dt);
          const on = isoDay(dt) === day;
          return (
            <button key={isoDay(dt)} type="button" role="radio" aria-checked={on} onClick={() => setDay(isoDay(dt))} className={on ? "chip on" : "chip"}
              style={{ flexDirection: "column", width: 58, height: 72, padding: 0, gap: 0, borderRadius: 14, justifyContent: "center" }}>
              <span style={{ fontSize: 12 }}>{p.dow}</span><span style={{ fontSize: 20, fontWeight: 800 }}>{p.num}</span><span style={{ fontSize: 12 }}>{p.mon}</span>
            </button>
          );
        })}
      </div>
      <div className="chips">
        {HOURS.map((h) => {
          const at = new Date(y, m - 1, d, h);
          if (at.getTime() < Date.now() + 3600000) return null;
          const iso = at.toISOString();
          return <button key={iso} type="button" className={slots.includes(iso) ? "chip on" : "chip"} aria-pressed={slots.includes(iso)} onClick={() => toggle(iso)}>{timeLabel(iso)}</button>;
        })}
      </div>
      {slots.length > 0 && <p className="small">{slots.map(slotLabel).join(" · ")}</p>}
    </div>
  );
}
