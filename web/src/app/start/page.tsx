"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Briefcase, CalendarDays, MapPin, Tent } from "lucide-react";
import { Seg, TopBar } from "@/components/ui";
import { dayLabel } from "@/lib/format";
import { BATCHES } from "@/lib/places";
import { setPrefs, usePrefs } from "@/lib/prefs";
import type { NyscStage, SharePref } from "@/lib/types";

const STAGES: { value: NyscStage; label: string; sub: string; Icon: typeof Tent }[] = [
  { value: "in_camp", label: "In camp", sub: "I have my call-up letter, no PPA yet", Icon: Tent },
  { value: "have_ppa", label: "I have my PPA", sub: "I know where I’m posted", Icon: MapPin },
  { value: "serving", label: "Already serving", sub: "Looking for a new place", Icon: Briefcase },
];

// The batch whose camp ends soonest from today is the likely default.
function defaultBatch() {
  const today = new Date().toISOString().slice(0, 10);
  return BATCHES.find((b) => b.campEnd >= today) ?? BATCHES[BATCHES.length - 1];
}

export default function Start() {
  const router = useRouter();
  const [prefs, ready] = usePrefs();
  const [stage, setStage] = useState<NyscStage | null>(null);
  const [pref, setPref] = useState<SharePref | null>(null);
  const [batch, setBatch] = useState(defaultBatch());

  useEffect(() => {
    if (!ready) return;
    setStage(prefs.stage);
    setPref(prefs.pref);
    const b = BATCHES.find((x) => x.id === prefs.batchId);
    if (b) setBatch(b);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const years = [...new Set(BATCHES.map((b) => b.year))];
  const pick = (letter: string, stream: number, year = batch.year) =>
    setBatch(BATCHES.find((b) => b.year === year && b.batch === letter && b.stream === stream) ?? batch);

  const go = () => {
    if (!stage || !pref) return;
    setPrefs({ introSeen: true, stage, pref, batchId: stage === "in_camp" ? batch.id : prefs.batchId });
    router.push(stage === "in_camp" ? "/explore" : "/ppa");
  };

  return (
    <main className="screen">
      <TopBar back="/" />
      <div className="body">
        <h1 className="h1">Where are you in NYSC?</h1>
        <div role="radiogroup" aria-label="NYSC stage" className="stack" style={{ gap: 10 }}>
          {STAGES.map(({ value, label, sub, Icon }) => (
            <button key={value} type="button" role="radio" aria-checked={stage === value}
              className={stage === value ? "opt on" : "opt"} onClick={() => setStage(value)}>
              <span className="ico"><Icon size={22} strokeWidth={2.2} /></span>
              <span className="stack" style={{ gap: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>{sub}</span>
              </span>
            </button>
          ))}
        </div>

        {stage === "in_camp" && (
          <div className="open stack" style={{ gap: 14 }}>
            <div className="grid2">
              <div className="stack">
                <label htmlFor="batch" className="lbl">Batch</label>
                <select id="batch" className="sel" value={`${batch.year}-${batch.batch}`}
                  onChange={(e) => { const [y, l] = e.target.value.split("-"); pick(l, batch.stream, Number(y)); }}>
                  {years.flatMap((y) => ["A", "B", "C"].map((l) => <option key={`${y}-${l}`} value={`${y}-${l}`}>{y} Batch {l}</option>))}
                </select>
              </div>
              <div className="stack">
                <label htmlFor="stream" className="lbl">Stream</label>
                <select id="stream" className="sel" value={batch.stream} onChange={(e) => pick(batch.batch, Number(e.target.value))}>
                  <option value={1}>Stream 1</option>
                  <option value={2}>Stream 2</option>
                </select>
              </div>
            </div>
            <div className="soft row">
              <CalendarDays size={22} color="var(--green)" strokeWidth={2.2} />
              <span className="stack" style={{ gap: 0 }}>
                <span className="small">You leave camp on</span>
                <span style={{ fontWeight: 700 }}>{dayLabel(batch.campEnd, true)}</span>
              </span>
            </div>
          </div>
        )}

        <div className="stack" style={{ gap: 10 }}>
          <span className="h2" style={{ fontSize: 16 }}>Share a home with</span>
          <Seg label="Share a home with" value={pref} onChange={setPref}
            options={[{ value: "women_only", label: "Women only" }, { value: "men_only", label: "Men only" }, { value: "mixed_ok", label: "Mixed is fine" }]} />
        </div>

        <p className="small" style={{ marginTop: "auto" }}>
          Bunkie is in Abuja for now. <Link href="/waitlist" style={{ fontWeight: 700 }}>Posted elsewhere? Join the waitlist</Link>
        </p>
      </div>
      <div className="foot">
        <button className="btn" disabled={!stage || !pref} onClick={go}>
          {stage === "in_camp" ? "Show rooms for camp exit" : "Continue"}
        </button>
      </div>
    </main>
  );
}
