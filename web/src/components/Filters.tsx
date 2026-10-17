"use client";
import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Chips, Seg, Sheet } from "@/components/ui";
import { addMonths, isoDay, nairaK } from "@/lib/format";
import { DEFAULT_FILTERS, setPrefs, usePrefs, type Prefs, type StayLength } from "@/lib/prefs";
import type { SharePref } from "@/lib/types";
import styles from "./filters.module.css";

/** Highest budget anyone can type; rooms on Bunkie are far below it. */
const BUDGET_CAP = 2_000_000;
const LIMITS = { weeks: 4, months: 12 } as const;

export function activeFilterCount(f: Prefs["filters"], inCamp: boolean): number {
  let n = 0;
  if (f.budget) n++;
  if (!inCamp && f.length) n++;
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
          <label className="h2" htmlFor="budget">Monthly budget</label>
          {/* "Up to" only: a cheaper room is never a problem, so there's no minimum. Empty means any. */}
          <label className="field">
            <span className="prefix">₦</span>
            <input id="budget" inputMode="numeric" placeholder="Any amount" autoComplete="off"
              value={f.budget ? f.budget.toLocaleString("en-NG") : ""}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, "").slice(0, 7));
                set({ budget: n > 0 ? Math.min(n, BUDGET_CAP) : null });
              }} />
          </label>
          <div className="chips">
            {[40000, 60000, 80000, 100000, null].map((v) => (
              <button key={v ?? "any"} className={f.budget === v ? "chip on" : "chip"} aria-pressed={f.budget === v}
                onClick={() => set({ budget: v })}>{v == null ? "Any" : nairaK(v)}</button>
            ))}
          </div>
          <span className="small">All in: rent share and bills. A bit over still shows as a close match.</span>
        </section>

        {!inCamp && (
          <section className={styles.sec}>
            <span className="h2">How long</span>
            <Seg label="Stay length" value={f.length?.unit ?? "any"}
              onChange={(v) => set({ length: v === "any" ? null : { unit: v, n: Math.min(f.length?.n ?? (v === "weeks" ? 2 : 3), LIMITS[v]) } })}
              options={[{ value: "weeks", label: "Weeks" }, { value: "months", label: "Months" }, { value: "any", label: "Any" }]} />
            {f.length && <LengthInput value={f.length} onChange={(length) => set({ length })} />}
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

/** A number you can type or step: 1-4 weeks or 1-12 months. */
function LengthInput({ value, onChange }: { value: StayLength; onChange: (v: StayLength) => void }) {
  const max = LIMITS[value.unit];
  const [text, setText] = useState(String(value.n));
  const commit = (n: number) => {
    const v = Math.max(1, Math.min(max, n || 1));
    setText(String(v));
    onChange({ ...value, n: v });
  };
  return (
    <div className="row" style={{ gap: 12 }}>
      <button type="button" className="step" disabled={value.n <= 1} onClick={() => commit(value.n - 1)} aria-label={`Fewer ${value.unit}`}>
        <Minus size={18} strokeWidth={2.4} />
      </button>
      <label className="field" style={{ width: 132, flex: "none" }}>
        <span className="sr-only">Number of {value.unit}</span>
        <input inputMode="numeric" value={text} style={{ textAlign: "center", fontWeight: 700 }}
          onChange={(e) => {
            const t = e.target.value.replace(/\D/g, "").slice(0, 2);
            setText(t);
            if (t) onChange({ ...value, n: Math.max(1, Math.min(max, Number(t))) });
          }}
          onBlur={() => commit(Number(text))} />
        <span className="muted" style={{ fontSize: 15 }}>{value.unit === "weeks" ? (value.n === 1 ? "week" : "weeks") : value.n === 1 ? "month" : "months"}</span>
      </label>
      <button type="button" className="step" disabled={value.n >= max} onClick={() => commit(value.n + 1)} aria-label={`More ${value.unit}`}>
        <Plus size={18} strokeWidth={2.4} />
      </button>
    </div>
  );
}
