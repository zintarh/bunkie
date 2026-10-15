"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { RequireAuth } from "@/components/auth";
import { Loading } from "@/components/ui";
import { errorText } from "@/lib/auth";
import { callFunction } from "@/lib/functions";

/** The video viewing, inside Bunkie (Daily's call screen in a frame). */
function Call() {
  const { id } = useParams<{ id: string }>();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callFunction<{ url: string }>("video-room", { booking_id: id })
      .then((r) => setUrl(r.url))
      .catch((e) => setError(errorText(e)));
  }, [id]);

  if (error) {
    return (
      <main className="screen" style={{ alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center" }}>
        <span className="h2">{error}</span>
        <Link className="btn" href={`/bookings/${id}`}>Back to booking</Link>
      </main>
    );
  }
  if (!url) return <Loading />;
  return (
    <main className="screen" style={{ background: "#0c1a14" }}>
      <div className="topbar" style={{ color: "#fff" }}>
        <Link className="ib" href={`/bookings/${id}`} aria-label="Leave call" style={{ color: "#fff" }}><ChevronLeft size={24} /></Link>
        <span className="title">Video viewing</span>
      </div>
      <iframe src={url} title="Video viewing" allow="camera; microphone; fullscreen; display-capture; autoplay"
        style={{ flex: 1, width: "100%", border: 0 }} />
    </main>
  );
}

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <RequireAuth next={`/bookings/${id}/call`}><Call /></RequireAuth>;
}
