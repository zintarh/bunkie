"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth";
import { Progress } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CostsStep, LocationStep, RefundsStep, RoomStep, RulesStep, STEPS, type Listing } from "./steps";
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

  const n = STEPS.indexOf(step as (typeof STEPS)[number]);
  const go = (s: Step) => router.push(`/host/listing/${id}?step=${s}`);
  const next = () => go(n >= 0 && n < STEPS.length - 1 ? STEPS[n + 1] : "review");
  const back = () => (n > 0 ? go(STEPS[n - 1]) : router.push("/host"));

  if (!listing) return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><span className="spin dark" aria-label="Loading" /></main>;
  const props = { listing, reload, next, back };

  return (
    <main className="screen">
      {step !== "review" && (
        <>
          <div className="topbar" style={{ padding: "0 16px", justifyContent: "space-between" }}>
            <span className="lbl">Step {n + 1} of {STEPS.length}</span>
            <Link className="pill" href="/host">Save &amp; exit</Link>
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
  );
}

export default function Page() {
  return <Suspense><RequireAuth><Wizard /></RequireAuth></Suspense>;
}
