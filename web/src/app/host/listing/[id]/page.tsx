"use client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/auth";
import { STEP_LABEL, stepsDone } from "@/lib/hosting";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CostsStep, ExitSave, LocationStep, RefundsStep, RoomStep, RulesStep, STEPS, type Listing } from "./steps";
import { PhotosStep } from "./PhotosStep";
import { ReviewStep } from "./ReviewStep";

type Step = (typeof STEPS)[number] | "review";

function Wizard() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const step = (useSearchParams().get("step") ?? "location") as Step;
  const [listing, setListing] = useState<Listing | null>(null);

  const reload = useCallback(async () => {
    const db = supabaseBrowser();
    if (!db) return;
    const { data } = await db.from("listings").select("*, listing_locations(*), listing_photos(id, path, shot, position, flagged), listing_costs(*), house_rules(*)").eq("id", id).single();
    setListing(data as Listing);
  }, [id]);
  useEffect(() => void reload(), [reload]);

  const exitSave = useRef<(() => Promise<void>) | null>(null);
  const [exiting, setExiting] = useState(false);

  const n = STEPS.indexOf(step as (typeof STEPS)[number]);
  const go = (s: Step) => router.push(`/host/listing/${id}?step=${s}`);

  const next = async () => go(n >= 0 && n < STEPS.length - 1 ? STEPS[n + 1] : "review");
  const back = () => (n > 0 ? go(STEPS[n - 1]) : router.push("/host"));
  // Leaving the open step (Save & exit, or a tap on the step bar) keeps its changes when it's complete.
  const saveOpenStep = async () => {
    try {
      if (exitSave.current) await exitSave.current();
    } catch {
      // Leave anyway; what was saved before stays saved.
    }
  };
  const saveAndExit = async () => {
    setExiting(true);
    await saveOpenStep();
    router.push("/host");
  };
  const jump = async (s: Step) => {
    if (s === step) return;
    setExiting(true);
    await saveOpenStep();
    await reload();
    setExiting(false);
    go(s);
  };

  if (!listing) return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><span className="spin dark" aria-label="Loading" /></main>;
  const props = { listing, reload, next, back };
  const done = stepsDone(listing);

  return (
    <ExitSave.Provider value={exitSave}>
    <main className="screen">
      {step !== "review" && (
        <>
          <div className="topbar" style={{ padding: "0 16px", justifyContent: "space-between" }}>
            <span className="lbl">Step {n + 1} of {STEPS.length} · {STEP_LABEL[STEPS[n]]}</span>
            <button className="pill" onClick={saveAndExit} disabled={exiting}>{exiting ? <span className="spin dark" /> : "Save & exit"}</button>
          </div>
          <nav className="stepbar" aria-label="Listing steps">
            {STEPS.map((s, i) => (
              <button key={s} className={[done.has(s) ? "done" : "", i === n ? "on" : ""].join(" ")} disabled={exiting}
                onClick={() => jump(s)} aria-label={`${STEP_LABEL[s]}${done.has(s) ? ", done" : ""}`} aria-current={i === n ? "step" : undefined}>
                <span />
              </button>
            ))}
          </nav>
        </>
      )}
      {step === "location" && <LocationStep {...props} />}
      {step === "photos" && <PhotosStep {...props} />}
      {step === "room" && <RoomStep {...props} />}
      {step === "costs" && <CostsStep {...props} />}
      {step === "rules" && <RulesStep {...props} />}
      {step === "refunds" && <RefundsStep {...props} />}
      {step === "review" && <ReviewStep {...props} />}
    </main>
    </ExitSave.Provider>
  );
}

export default function Page() {
  return <Suspense><RequireAuth><Wizard /></RequireAuth></Suspense>;
}
