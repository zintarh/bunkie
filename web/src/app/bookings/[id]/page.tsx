"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CircleHelp } from "lucide-react";
import { RequireAuth } from "@/components/auth";
import { TopBar } from "@/components/ui";
import { useMe } from "@/lib/auth";
import { useBooking } from "@/lib/bookings";
import { HostView } from "./HostView";
import { TenantView } from "./TenantView";

function BookingScreen() {
  const { id } = useParams<{ id: string }>();
  const sent = useSearchParams().get("sent");
  const [me] = useMe();
  const [b, reload] = useBooking(id);

  if (b === undefined) {
    return <main className="screen" style={{ alignItems: "center", justifyContent: "center" }}><span className="spin dark" aria-label="Loading" /></main>;
  }
  if (b === null) {
    return (
      <main className="screen">
        <TopBar back="/bookings" />
        <div className="body"><h1 className="h1">Booking not found</h1><Link className="btn" href="/bookings">Go to bookings</Link></div>
      </main>
    );
  }
  const isHost = me?.user.id === b.host_id;
  return (
    <main className="screen">
      <TopBar back={isHost ? "/host" : "/bookings"}
        right={<Link className="ib" href={`/help?booking=${b.id}`} aria-label="Get help"><CircleHelp size={22} /></Link>} />
      {sent && b.status === "requested" && !isHost && <div className="banner green open" style={{ margin: "0 20px 8px" }}>Request sent to {b.host.first_name}</div>}
      {isHost ? <HostView b={b} reload={reload} /> : <TenantView b={b} reload={reload} />}
    </main>
  );
}

export default function Page() {
  return <Suspense><RequireAuth><BookingScreen /></RequireAuth></Suspense>;
}
