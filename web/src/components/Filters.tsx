"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { Chips, Seg, Sheet } from "@/components/ui";
import { addMonths, isoDay, nairaK } from "@/lib/format";
import { DEFAULT_FILTERS, setPrefs, usePrefs, type Prefs } from "@/lib/prefs";
import type { SharePref } from "@/lib/types";
import styles from "./filters.module.css";

const MIN = 20000;
const MAX = 150000;

export function activeFilterCount(f: Prefs["filters"], inCamp: boolean): number {
  let n = 0;
  if (f.priceMax < MAX) n++;
  if (!inCamp && f.stay !== "any") n++;
  if (f.room) n++;
  if (!inCamp && f.maxMinutes) n++;
  if (!inCamp && f.moveIn) n++;
  return n;
}

export function Filters({ inCamp, onClose }: { inCamp: boolean; onClose: () => void }) {
  const [prefs] = usePrefs();
  const [f, setF] = useState(prefs.filters);
  const [pref, setPref] = useState<SharePref | null>(prefs.pref);
  const [moveChoice, setMoveChoice] = useState<string>(() => (f.moveIn ? "pick" : "any"));
  const set = (patch: Partial<Prefs["filters"]>) => setF((x) => ({ ...x, ...patch }));

  const pct = (v: number) => (v - MIN) / (MAX - MIN);
  const apply = () => {
    setPrefs({ filters: f, pref });
    onClose();
  };
  const today = new Date();
  const monthStart = (n: number) => isoDay(addMonths(new Date(today.getFullYear(), today.getMonth(), 1), n));

  return (
    <Sheet onClose={onClose} label="Filters" side>
      <div className="topbar" style={{ padding: "0 8px" }}>
        <button className="ib" onClick={onClose} aria-label="Close"><X size={22} strokeWidth={2.4} /></button>
        <span style={{ flex: 1, textAlign: "center", fontWeight: 700 }}>Filters</span>
        <button className="link" onClick={() => { setF(DEFAULT_FILTERS); setMoveChoice("any"); }}>Clear</button>
      </div>
      <div className={styles.body}>
        <section className={styles.sec}>
          <div className="between">
            <span className="h2">Monthly budget</span>
            <span className="num" style={{ fontWeight: 700 }}>{f.priceMax >= MAX ? "Any" : `Up to ${nairaK(f.priceMax)}`}</span>
          </div>
          {/* One "up to" slider: a cheaper room is never a problem, so there's no minimum. */}
          <div className={styles.range}>
            <span className={styles.track} />
            <span className={styles.fill} style={{ left: 14, right: `calc(14px + ${(1 - pct(f.priceMax)) * 100}% - ${(1 - pct(f.priceMax)) * 28}px)` }} />
            <label htmlFor="bmax" className="sr-only">Monthly budget</label>
            <input id="bmax" type="range" min={MIN} max={MAX} step={5000} value={f.priceMax}
              onChange={(e) => set({ priceMin: DEFAULT_FILTERS.priceMin, priceMax: Number(e.target.value) })} />
          </div>
          <div className="chips">
            {[40000, 60000, 80000, 100000, MAX].map((v) => (
              <button key={v} className={f.priceMax === v ? "chip on" : "chip"} aria-pressed={f.priceMax === v}
                onClick={() => set({ priceMin: DEFAULT_FILTERS.priceMin, priceMax: v })}>{v >= MAX ? "Any" : nairaK(v)}</button>
            ))}
          </div>
          <span className="small">All in: rent share and bills. A bit over still shows as a close match.</span>
        </section>

        {!inCamp && (
          <section className={styles.sec}>
            <span className="h2">How long</span>
            <Seg label="Stay length" value={f.stay} onChange={(v) => set({ stay: v })}
              options={[{ value: "weeks", label: "1–4 weeks" }, { value: "short", label: "1–3 months" }, { value: "long", label: "6–12 mo" }, { value: "any", label: "Any" }]} />
          </section>
        )}

        <section className={styles.sec}>
          <span className="h2">Share a home with</span>
          <Seg label="Household" value={pref} onChange={setPref}
            options={[{ value: "women_only", label: "Women only" }, { value: "men_only", label: "Men only" }, { value: "mixed_ok", label: "Mixed is fine" }]} />
        </section>

        {!inCamp && (
          <section className={styles.sec}>
            <span className="h2">Move in</span>
            <Chips label="Move in" value={moveChoice}
              onChange={(v) => {
                setMoveChoice(v);
                set({ moveIn: v === "any" ? null : v === "this" ? isoDay(today) : v === "next" ? monthStart(1) : f.moveIn ?? isoDay(today) });
              }}
              options={[{ value: "any", label: "Any time" }, { value: "this", label: "This month" }, { value: "next", label: "Next month" }, { value: "pick", label: "Pick a date" }]} />
            {moveChoice === "pick" && (
              <label className="field open">
                <span className="sr-only">Move-in date</span>
                <input type="date" value={f.moveIn ?? ""} min={isoDay(today)} onChange={(e) => set({ moveIn: e.target.value || null })} />
              </label>
            )}
          </section>
        )}

        <section className={styles.sec}>
          <span className="h2">Room</span>
          <Seg label="Room type" value={f.room ?? "any"} onChange={(v) => set({ room: v === "any" ? null : v })}
            options={[{ value: "own_room", label: "Own room" }, { value: "self_contain", label: "Self con" }, { value: "shared_room", label: "Shared" }, { value: "any", label: "Any" }]} />
        </section>

        {!inCamp && (
          <section className={styles.sec}>
            <span className="h2">Time to your PPA</span>
            <Chips label="Time to your PPA" value={f.maxMinutes ?? 0} onChange={(v) => set({ maxMinutes: v || null })}
              options={[{ value: 15, label: "15 min" }, { value: 30, label: "30 min" }, { value: 45, label: "45 min" }, { value: 0, label: "Any" }]} />
          </section>
        )}
      </div>
      <div className="foot" style={{ boxShadow: "none", borderTop: "1px solid var(--line)", borderRadius: 0 }}>
        <button className="btn" onClick={apply}>Show rooms</button>
      </div>
    </Sheet>
  );
}
