"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Award, Check, ChevronRight, CircleAlert } from "lucide-react";
import { TopBar } from "@/components/ui";
import { errorText, useMe } from "@/lib/auth";
import { naira } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { StepProps } from "./steps";
import { qs } from "@/lib/url";

const FIX: Record<string, { label: string; href: (id: string) => string }> = {
  location: { label: "Location", href: (id) => `/host/listing/${id}?step=location` },
  photos: { label: "Room photos", href: (id) => `/host/listing/${id}?step=photos` },
  rent: { label: "Rent share", href: (id) => `/host/listing/${id}?step=costs` },
  room_kind: { label: "Room type", href: (id) => `/host/listing/${id}?step=room` },
  household: { label: "Household", href: (id) => `/host/listing/${id}?step=room` },
  available_from: { label: "Available from", href: (id) => `/host/listing/${id}?step=room` },
  weekly_price: { label: "Short stay price", href: (id) => `/host/listing/${id}?step=room` },
  rules: { label: "House rules", href: (id) => `/host/listing/${id}?step=rules` },
  permission: { label: "Permission to share", href: (id) => `/host/listing/${id}?step=refunds` },
  bunkie_questions: { label: "Bunkie questions", href: (id) => `/questions?next=${qs(`/host/listing/${id}?step=review`)}` },
  verification: { label: "Verify you", href: (id) => `/verify?as=host&next=${qs(`/host/listing/${id}?step=review`)}` },
  payout: { label: "Get paid: bank account", href: (id) => `/host/payout?next=${qs(`/host/listing/${id}?step=review`)}` },
};

export function ReviewStep({ listing, reload }: StepProps) {
  const router = useRouter();
  const [me] = useMe();
  const [missing, setMissing] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser()?.rpc("listing_missing", { p_listing: listing.id }).then(({ data }) => setMissing((data as string[]) ?? []));
  }, [listing.id, listing.status]);

  const publish = async () => {
    setBusy(true);
    setError(null);
    const { error } = (await supabaseBrowser()?.rpc("publish_listing", { p_listing: listing.id })) ?? {};
    setBusy(false);
    if (error) return setError(errorText(error));
    await reload();
  };
  const pause = async (paused: boolean) => {
    setBusy(true);
    const { error } = (await supabaseBrowser()?.rpc("pause_listing", { p_listing: listing.id, p_paused: paused })) ?? {};
    setBusy(false);
    if (error) return setError(errorText(error));
    await reload();
  };

  const cover = listing.listing_photos.find((p) => p.shot === "bedroom") ?? listing.listing_photos[0];
  const live = listing.status === "live";
  return (
    <>
      <TopBar back="/host" />
      <div className="body open">
        <h1 className="h1">{live ? "Your room is live" : listing.status === "flagged" ? "In review" : listing.status === "paused" ? "Paused" : "Ready to publish?"}</h1>
        <div className="rcard">
          <div className="photo" style={{ height: 180, borderRadius: 18, backgroundImage: cover ? `url(${photoUrl(cover.path)})` : undefined }} />
          <div className="stack" style={{ gap: 2, padding: "0 8px 8px" }}>
            <span className="price num" style={{ fontSize: 20 }}>{listing.total_varies ? "about " : ""}{naira(listing.monthly_total)}<span className="muted" style={{ fontFamily: "var(--body)", fontWeight: 500, fontSize: 14 }}> /month</span></span>
            <span style={{ fontSize: 14 }}>{listing.room_kind === "shared_room" ? "Shared room" : "Own room"} in {listing.area_name}</span>
          </div>
        </div>
        {listing.status === "flagged" && <div className="banner amber"><CircleAlert size={20} />Some photos were taken far from the pin. We&apos;re checking them before the room goes live.</div>}
        {missing && missing.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="h2">Finish these first</span>
            <div className="lrows">
              {missing.map((m) => (
                <Link key={m} className="lrow" href={FIX[m]?.href(listing.id) ?? "#"}>
                  <span className="tile t-amber"><CircleAlert size={20} /></span><span style={{ flex: 1 }}>{FIX[m]?.label ?? m}</span><ChevronRight size={18} color="var(--muted)" />
                </Link>
              ))}
            </div>
          </div>
        )}
        {missing && missing.length === 0 && listing.status === "draft" && <div className="banner green"><Check size={20} />Everything&apos;s in.</div>}
        {me && (me.profile.corper_status === "serving" || me.profile.corper_status === "served") && !me.profile.corper_verified && (
          <div className="lrows">
            <Link className="lrow" href={`/host/corper?next=${qs(`/host/listing/${listing.id}?step=review`)}`}>
              <span className="tile t-amber"><Award size={20} /></span><span style={{ flex: 1 }}>Get your corper badge</span><ChevronRight size={18} color="var(--muted)" />
            </Link>
          </div>
        )}
        <Link className="link" style={{ alignSelf: "flex-start" }} href={`/host/listing/${listing.id}?step=location`}>Edit listing</Link>
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <div className="foot">
        {listing.status === "draft" && <button className="btn" disabled={busy || !missing || missing.length > 0} onClick={publish}>{busy ? <span className="spin" /> : "Publish"}</button>}
        {live && <><Link className="btn" href={`/rooms/${listing.id}`}>See it as a bunkie</Link><button className="link" disabled={busy} onClick={() => pause(true)}>Pause listing</button></>}
        {listing.status === "paused" && <button className="btn" disabled={busy} onClick={() => pause(false)}>Turn back on</button>}
        {listing.status === "flagged" && <button className="btn ghost" onClick={() => router.push("/host")}>Back to hosting</button>}
      </div>
    </>
  );
}
