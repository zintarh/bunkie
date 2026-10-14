"use client";
import { createContext, useContext, useEffect, useState, type MutableRefObject, type ReactNode } from "react";
import { LocateFixed, Plus, X } from "lucide-react";
import { PinMap } from "@/components/PinMap";
import { PlaceSearch, placeAt, type Place } from "@/components/PlaceSearch";
import { Chips, Seg, Stepper, Switch } from "@/components/ui";
import { errorText } from "@/lib/auth";
import { isoDay, months as monthsLabel, naira } from "@/lib/format";
import { useHasGps } from "@/lib/device";
import { HOST_STEPS } from "@/lib/hosting";
import { position } from "@/lib/image";
import { ZONES, nearestZone } from "@/lib/places";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BathKind, Household, PaySchedule, PhotoShot, RoomKind } from "@/lib/types";

export const STEPS = HOST_STEPS;

export type Listing = {
  id: string; status: string; area_name: string; room_kind: RoomKind | null; bath_kind: BathKind | null; furnished: boolean | null;
  household: Household | null; open_to_camp: boolean; min_months: number; max_months: number; pay_schedule: PaySchedule;
  available_from: string | null; rent_monthly: number | null; deposit: number | null; monthly_total: number; total_varies: boolean;
  early_leave_notice_days: number; redeploy_refund: "all_unused" | "unused_minus_2w"; ask_leave_notice_days: number; allowed_to_share: boolean;
  listing_locations: { address_line: string; lat: number; lng: number; landmark: string | null } | null;
  listing_photos: { id: string; path: string; shot: PhotoShot; position: number; flagged: boolean }[];
  listing_costs: { id: string; name: string; amount: number; tenant_pays: boolean; varies: boolean; position: number }[];
  house_rules: { id: string; topic: string; choice: string; consequence: string; is_custom: boolean; position: number }[];
};
export type StepProps = { listing: Listing; reload: () => Promise<void>; next: () => Promise<void>; back: () => void };

/** Footer with Back and Next; Next saves first and only moves on if saving worked. */
/** "Save & exit" saves the open step through this, when the step is complete enough to save. */
export const ExitSave = createContext<MutableRefObject<(() => Promise<void>) | null> | null>(null);

export function StepShell({ title, children, canNext, onSave, back, next, nextLabel = "Next" }: {
  title: string; children: ReactNode; canNext: boolean; onSave: () => Promise<void>; back: () => void; next: () => void | Promise<void>; nextLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exitSave = useContext(ExitSave);
  useEffect(() => {
    if (!exitSave) return;
    exitSave.current = canNext ? onSave : null;
    return () => {
      exitSave.current = null;
    };
  });
  const go = async () => {
    if (!canNext) return next();
    setBusy(true);
    setError(null);
    try {
      await onSave();
      await next();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="body open" style={{ paddingTop: 20 }}>
        <h1 className="h1">{title}</h1>
        {children}
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <div className="foot split">
        <button className="link" onClick={back}>Back</button>
        <button className={canNext ? "next" : "next skip"} disabled={busy} onClick={go}>{busy ? <span className="spin" /> : canNext ? nextLabel : "Skip"}</button>
      </div>
    </>
  );
}

const db = () => {
  const c = supabaseBrowser();
  if (!c) throw new Error("Connect Supabase first.");
  return c;
};
async function saveListing(id: string, patch: Partial<Listing>) {
  const { error } = await db().from("listings").update(patch).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
export function LocationStep({ listing, reload, next, back }: StepProps) {
  const loc = listing.listing_locations;
  const [address, setAddress] = useState(loc?.address_line ?? "");
  const [landmark, setLandmark] = useState(loc?.landmark ?? "");
  const [area, setArea] = useState(listing.area_name);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(loc ? { lat: loc.lat, lng: loc.lng } : null);
  const gps = useHasGps();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPlace = (p: Place) => {
    setPin({ lat: p.lat, lng: p.lng });
    setAddress(p.address);
    setArea(p.area);
    setError(null);
  };

  const here = async () => {
    setLocating(true);
    setError(null);
    const p = await position(12000);
    if (!p) {
      setLocating(false);
      return setError("Couldn't get your location. Allow location and stand at the room.");
    }
    try {
      const place = await placeAt(p.lat, p.lng);
      if (place) applyPlace(place);
      else {
        setPin(p);
        if (!area) setArea(nearestZone(p.lat, p.lng).name);
      }
    } catch {
      setError("That location isn't in Abuja. Bunkie is in Abuja for now.");
    }
    setLocating(false);
  };

  return (
    <StepShell title="Where's the room?" back={back} next={next} canNext={!!pin && address.trim().length > 4 && area.trim().length > 1}
      onSave={async () => {
        await saveListing(listing.id, { area_name: area.trim() });
        const { error } = await db().from("listing_locations").upsert({ listing_id: listing.id, address_line: address.trim(), landmark: landmark.trim() || null, lat: pin!.lat, lng: pin!.lng });
        if (error) throw error;
        await reload();
      }}>
      {!pin ? (
        <>
          <PlaceSearch placeholder="Search the street or building" onPick={applyPlace} />
          {gps && <button className="opt" onClick={here} disabled={locating}>
            <span className="ico"><LocateFixed size={20} /></span>
            <span className="stack" style={{ gap: 2 }}>
              <span>{locating ? "Finding you…" : "I'm at the room now"}</span>
              <span className="small" style={{ fontWeight: 400 }}>Uses your phone&apos;s location</span>
            </span>
          </button>}
        </>
      ) : (
        <>
          <PinMap lat={pin.lat} lng={pin.lng} onMove={setPin} label={`Map of ${address || area}. Drag the map to move the pin.`} />
          <div className="between">
            <span className="small" style={{ fontSize: 14 }}>Drag the map so the pin is on the room. Only shown to a bunkie once a viewing is booked.</span>
            <button className="link" onClick={() => setPin(null)}>Change</button>
          </div>
          <div className="stack">
            <label className="lbl" htmlFor="addr">Address <span style={{ fontWeight: 500 }}>· add the flat or house number</span></label>
            <label className="field"><input id="addr" autoComplete="street-address" placeholder="Flat 4, Block C, Aminu Kano Crescent" value={address} onChange={(e) => setAddress(e.target.value)} /></label>
          </div>
          <div className="stack">
            <label className="lbl" htmlFor="area">Area</label>
            <label className="field"><input id="area" list="areas" maxLength={80} placeholder="Wuse 2" value={area} onChange={(e) => setArea(e.target.value)} /></label>
            <datalist id="areas">{ZONES.map((z) => <option key={z.id} value={z.name} />)}</datalist>
          </div>
          <div className="stack">
            <label className="lbl" htmlFor="landmark">Landmark <span style={{ fontWeight: 500 }}>· optional</span></label>
            <label className="field"><input id="landmark" placeholder="Opposite Banex Plaza" value={landmark} onChange={(e) => setLandmark(e.target.value)} /></label>
          </div>
        </>
      )}
      {error && <p className="err">{error}</p>}
    </StepShell>
  );
}

// ---------------------------------------------------------------------------
export function RoomStep({ listing, reload, next, back }: StepProps) {
  const [room, setRoom] = useState<RoomKind>(listing.room_kind ?? "own_room");
  const [bath, setBath] = useState<BathKind>(listing.bath_kind ?? "shared");
  const [who, setWho] = useState<Household | null>(listing.household);
  const [camp, setCamp] = useState(listing.open_to_camp);
  const [furn, setFurn] = useState(listing.furnished ?? true);
  const [mn, setMn] = useState(listing.min_months);
  const [mx, setMx] = useState(listing.max_months === 12 && listing.min_months === 1 ? 6 : listing.max_months);
  const [pay, setPay] = useState<PaySchedule>(listing.pay_schedule);
  const [from, setFrom] = useState(listing.available_from ?? isoDay(new Date()));
  return (
    <StepShell title="Room and stay" back={back} next={next} canNext={!!who && !!from}
      onSave={async () => {
        await saveListing(listing.id, { room_kind: room, bath_kind: bath, household: who, open_to_camp: camp, furnished: furn, min_months: mn, max_months: mx, pay_schedule: pay, available_from: from });
        await reload();
      }}>
      <Seg label="Room" value={room} onChange={setRoom} options={[{ value: "own_room", label: "Own room" }, { value: "shared_room", label: "Shared room" }]} />
      <Seg label="Bathroom" value={bath} onChange={setBath} options={[{ value: "own", label: "Own bathroom" }, { value: "shared", label: "Shared bathroom" }]} />
      <div className="stack" style={{ gap: 10 }}>
        <span className="h2">Household</span>
        <Seg label="Household" value={who} onChange={setWho} options={[{ value: "women", label: "Women" }, { value: "men", label: "Men" }, { value: "mixed", label: "Mixed" }]} />
      </div>
      <div className="between">
        <span className="stack" style={{ gap: 2 }}><span className="h2" style={{ fontSize: 16 }}>Open to camp bookings</span><span className="small">Corpers view by video call from camp. They can switch free once they get their PPA.</span></span>
        <Switch on={camp} onChange={setCamp} label="Open to camp bookings" />
      </div>
      <div className="between"><span className="h2" style={{ fontSize: 16 }}>Furnished</span><Switch on={furn} onChange={setFurn} label="Furnished" /></div>
      <div className="between"><span className="h2" style={{ fontSize: 16 }}>Shortest stay</span><Stepper value={mn} min={1} max={mx} onChange={setMn} format={monthsLabel} label="months" /></div>
      <div className="between"><span className="h2" style={{ fontSize: 16 }}>Longest stay</span><Stepper value={mx} min={mn} max={12} onChange={setMx} format={monthsLabel} label="months" /></div>
      <div className="stack" style={{ gap: 10 }}>
        <span className="h2">Payment</span>
        <Seg label="Payment" value={pay} onChange={setPay} options={[{ value: "monthly", label: "Monthly" }, { value: "lump_sum", label: "Lump sum" }]} />
      </div>
      <div className="stack">
        <label className="lbl" htmlFor="from">Available from</label>
        <label className="field"><input id="from" type="date" min={isoDay(new Date())} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      </div>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------
type Bill = { key: number; name: string; amount: number; tenant_pays: boolean; varies: boolean };
const SUGGEST = ["Light", "Water", "Generator fuel", "Service charge", "Wi-Fi", "Waste"];
const num = (v: string) => parseInt(v.replace(/\D/g, ""), 10) || 0;

export function CostsStep({ listing, reload, next, back }: StepProps) {
  const [rent, setRent] = useState(listing.rent_monthly ?? 0);
  const [depOn, setDepOn] = useState((listing.deposit ?? 0) > 0);
  const [dep, setDep] = useState(listing.deposit ?? 20000);
  const [bills, setBills] = useState<Bill[]>(() =>
    listing.listing_costs.sort((a, b) => a.position - b.position).map((c, i) => ({ key: i, name: c.name, amount: c.amount, tenant_pays: c.tenant_pays, varies: c.varies })));
  const upd = (key: number, patch: Partial<Bill>) => setBills((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const add = (name: string) => setBills((bs) => [...bs, { key: Date.now(), name, amount: 0, tenant_pays: true, varies: false }]);

  const paid = bills.filter((b) => b.tenant_pays);
  const total = rent + paid.reduce((a, b) => a + b.amount, 0);
  const varies = paid.some((b) => b.varies);
  const have = bills.map((b) => b.name);

  return (
    <StepShell title="Costs" back={back} next={next} canNext={rent > 0 && bills.every((b) => b.name.trim())}
      onSave={async () => {
        await saveListing(listing.id, { rent_monthly: rent, deposit: depOn ? dep : 0 });
        const c = db();
        const del = await c.from("listing_costs").delete().eq("listing_id", listing.id);
        if (del.error) throw del.error;
        if (bills.length) {
          const ins = await c.from("listing_costs").insert(bills.map((b, i) => ({ listing_id: listing.id, name: b.name.trim().slice(0, 40), amount: b.amount, tenant_pays: b.tenant_pays, varies: b.varies, position: i })));
          if (ins.error) throw ins.error;
        }
        await reload();
      }}>
      <div className="stack">
        <label className="lbl" htmlFor="rent">Rent share, every month</label>
        <label className="field"><span className="prefix">₦</span><input id="rent" inputMode="numeric" value={rent ? rent.toLocaleString("en-NG") : ""} onChange={(e) => setRent(num(e.target.value))} /></label>
      </div>
      <span className="h2">Bills</span>
      {bills.map((b) => (
        <div key={b.key} className="card stack open" style={{ gap: 10, padding: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1, minHeight: 48 }}><span className="sr-only">Cost name</span><input value={b.name} placeholder="Cost name" maxLength={40} onChange={(e) => upd(b.key, { name: e.target.value })} /></label>
            <button className="ib" aria-label={`Remove ${b.name || "cost"}`} onClick={() => setBills((bs) => bs.filter((x) => x.key !== b.key))}><X size={18} /></button>
          </div>
          <Seg label={`${b.name}: who pays`} value={b.tenant_pays ? "tenant" : "inc"} onChange={(v) => upd(b.key, { tenant_pays: v === "tenant" })}
            options={[{ value: "tenant", label: "Bunkie pays" }, { value: "inc", label: "Included in rent" }]} />
          {b.tenant_pays && (
            <div className="row" style={{ gap: 10 }}>
              <label className="field" style={{ flex: 1, minHeight: 48 }}><span className="prefix">₦</span><span className="sr-only">{b.name} a month</span>
                <input inputMode="numeric" placeholder="a month" value={b.amount ? b.amount.toLocaleString("en-NG") : ""} onChange={(e) => upd(b.key, { amount: num(e.target.value) })} /></label>
              <label className="check" style={{ fontSize: 14 }}><input type="checkbox" checked={b.varies} onChange={() => upd(b.key, { varies: !b.varies })} />Varies</label>
            </div>
          )}
        </div>
      ))}
      <div className="chips">
        {SUGGEST.filter((n) => !have.includes(n)).map((n) => <button key={n} className="chip dashed" onClick={() => add(n)}><Plus size={14} />{n}</button>)}
        <button className="chip dashed" onClick={() => add("")}><Plus size={14} />Other cost</button>
      </div>
      <div className="between">
        <span className="h2" style={{ fontSize: 16 }}>Caution deposit</span>
        <Switch on={depOn} onChange={setDepOn} label="Caution deposit" />
      </div>
      {depOn && (
        <label className="field open"><span className="prefix">₦</span><span className="sr-only">Deposit</span>
          <input inputMode="numeric" value={dep ? dep.toLocaleString("en-NG") : ""} onChange={(e) => setDep(num(e.target.value))} /></label>
      )}
      <div className="soft stack" style={{ gap: 4 }}>
        <div className="between"><span>Bunkie pays a month</span><b className="num">{varies ? "about " : ""}{naira(total)}</b></div>
        <span className="small">You get {naira(Math.round(total * 0.98))} after the 2% fee</span>
      </div>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------
const RULES: Record<string, string[]> = {
  Guests: ["Anytime", "Day visitors only", "No guests"],
  Cooking: ["Shared kitchen", "Own cooker only"],
  Smoking: ["Outside only", "Not allowed"],
  Pets: ["No pets", "Small pets OK"],
  Noise: ["Quiet after 10pm", "Quiet after midnight"],
};
const CONSEQ = [{ value: "warning", label: "Warning" }, { value: "warning_then_notice", label: "Warning, then notice" }, { value: "notice", label: "Notice to leave" }];
type Rule = { topic: string; choice: string; consequence: string; is_custom: boolean };

export function RulesStep({ listing, reload, next, back }: StepProps) {
  const [rules, setRules] = useState<Rule[]>(() => listing.house_rules.sort((a, b) => a.position - b.position).map(({ topic, choice, consequence, is_custom }) => ({ topic, choice, consequence, is_custom })));
  const get = (t: string) => rules.find((r) => r.topic === t && !r.is_custom);
  const set = (t: string, choice: string | null) =>
    setRules((rs) => (choice ? [...rs.filter((r) => r.topic !== t || r.is_custom), { topic: t, choice, consequence: get(t)?.consequence ?? "warning_then_notice", is_custom: false }] : rs.filter((r) => r.topic !== t || r.is_custom)));
  const customs = rules.filter((r) => r.is_custom);

  return (
    <StepShell title="House rules" back={back} next={next} canNext={rules.length > 0 && customs.every((c) => c.choice.trim())}
      onSave={async () => {
        const c = db();
        const del = await c.from("house_rules").delete().eq("listing_id", listing.id);
        if (del.error) throw del.error;
        if (rules.length) {
          const ins = await c.from("house_rules").insert(rules.map((r, i) => ({ listing_id: listing.id, topic: r.is_custom ? "Rule" : r.topic, choice: r.choice.trim(), consequence: r.consequence, is_custom: r.is_custom, position: i })));
          if (ins.error) throw ins.error;
        }
        await reload();
      }}>
      {Object.entries(RULES).map(([topic, choices]) => {
        const r = get(topic);
        return (
          <div key={topic} className="stack" style={{ gap: 10, paddingBottom: 16, borderBottom: "1px solid var(--line)" }}>
            <span className="h2" style={{ fontSize: 16 }}>{topic}</span>
            <Chips label={topic} value={r?.choice ?? "Not needed"} onChange={(v) => set(topic, v === "Not needed" ? null : v)}
              options={["Not needed", ...choices].map((c) => ({ value: c, label: c }))} />
            {r && (
              <select className="sel open" aria-label={`If the ${topic.toLowerCase()} rule is broken`} value={r.consequence}
                onChange={(e) => setRules((rs) => rs.map((x) => (x === r ? { ...x, consequence: e.target.value } : x)))}>
                {CONSEQ.map((c) => <option key={c.value} value={c.value}>If broken: {c.label}</option>)}
              </select>
            )}
          </div>
        );
      })}
      {customs.map((r, i) => (
        <div key={i} className="stack open" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}><span className="sr-only">Your rule</span>
              <input placeholder="Your rule" maxLength={160} value={r.choice} onChange={(e) => setRules((rs) => rs.map((x) => (x === r ? { ...x, choice: e.target.value } : x)))} /></label>
            <button className="ib" aria-label="Remove rule" onClick={() => setRules((rs) => rs.filter((x) => x !== r))}><X size={18} /></button>
          </div>
          <select className="sel" aria-label="If this rule is broken" value={r.consequence} onChange={(e) => setRules((rs) => rs.map((x) => (x === r ? { ...x, consequence: e.target.value } : x)))}>
            {CONSEQ.map((c) => <option key={c.value} value={c.value}>If broken: {c.label}</option>)}
          </select>
        </div>
      ))}
      <button className="chip dashed" style={{ alignSelf: "flex-start" }} onClick={() => setRules((rs) => [...rs, { topic: "Rule", choice: "", consequence: "warning", is_custom: true }])}><Plus size={14} />Add a rule</button>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------
export function RefundsStep({ listing, reload, next, back }: StepProps) {
  const [early, setEarly] = useState(listing.early_leave_notice_days);
  const [redep, setRedep] = useState(listing.redeploy_refund);
  const [ask, setAsk] = useState(listing.ask_leave_notice_days);
  const [perm, setPerm] = useState(listing.allowed_to_share);
  const days = [7, 14, 30].map((d) => ({ value: d, label: `${d} days` }));
  return (
    <StepShell title="Refunds" back={back} next={next} canNext={perm} nextLabel="Review"
      onSave={async () => {
        await saveListing(listing.id, { early_leave_notice_days: early, redeploy_refund: redep, ask_leave_notice_days: ask, allowed_to_share: perm });
        await reload();
      }}>
      <div className="stack" style={{ gap: 10 }}>
        <span className="h2" style={{ fontSize: 16 }}>Your bunkie leaves early</span>
        <span className="small">Notice they give. Unused months go back.</span>
        <Chips label="Notice for leaving early" value={early} onChange={setEarly} options={days} />
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <span className="h2" style={{ fontSize: 16 }}>They&apos;re redeployed</span>
        <Chips label="Redeployment refund" value={redep} onChange={setRedep}
          options={[{ value: "all_unused", label: "All unused months" }, { value: "unused_minus_2w", label: "Unused months minus 2 weeks" }]} />
      </div>
      <div className="stack" style={{ gap: 10 }}>
        <span className="h2" style={{ fontSize: 16 }}>You ask them to leave</span>
        <span className="small">Notice you give. Unused months go back.</span>
        <Chips label="Notice when you ask them to leave" value={ask} onChange={setAsk} options={days} />
      </div>
      <label className="opt" style={{ cursor: "pointer", borderColor: perm ? "var(--green)" : undefined }}>
        <input type="checkbox" checked={perm} onChange={() => setPerm(!perm)} style={{ width: 22, height: 22, accentColor: "var(--green-text)" }} />
        <span style={{ fontSize: 15 }}>I&apos;m allowed to share this home (I own it, or my landlord agrees)</span>
      </label>
    </StepShell>
  );
}
