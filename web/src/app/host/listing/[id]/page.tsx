"use client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/components/auth";
import { Progress } from "@/components/ui";
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

  // Remember the furthest finished step, so the host feed and home can show progress and reopen here.
  const markDone = async () => {
    const db = supabaseBrowser();
    if (!db || !listing || n < 0 || listing.draft_step >= n + 1) return;
    await db.from("listings").update({ draft_step: n + 1 }).eq("id", id);
    setListing({ ...listing, draft_step: n + 1 });
  };
  const next = async () => {
    await markDone();
    go(n >= 0 && n < STEPS.length - 1 ? STEPS[n + 1] : "review");
  };
  const back = () => (n > 0 ? go(STEPS[n - 1]) : router.push("/host"));
  const saveAndExit = async () => {
    setExiting(true);
    try {
      if (exitSave.current) {
        await exitSave.current();
        await markDone();
      }
    } catch {
      // Leave anyway; the steps finished before this one are already saved.
    }
    router.push("/host");
  };

  if (!listing) return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><span className="spin dark" aria-label="Loading" /></main>;
  const props = { listing, reload, next, back };

  return (
    <ExitSave.Provider value={exitSave}>
    <main className="screen">
      {step !== "review" && (
        <>
          <div className="topbar" style={{ padding: "0 16px", justifyContent: "space-between" }}>
            <span className="lbl">Step {n + 1} of {STEPS.length}</span>
            <button className="pill" onClick={saveAndExit} disabled={exiting}>{exiting ? <span className="spin dark" /> : "Save & exit"}</button>
          </div>
          <Progress value={(n + 1) / STEPS.length} />
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
