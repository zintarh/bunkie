"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, CircleAlert, ImageUp, Plus, X } from "lucide-react";
import { errorText } from "@/lib/auth";
import { position, shrink, shrinkFile, type Shrunk } from "@/lib/image";
import { photoUrl } from "@/lib/photos";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { PhotoShot } from "@/lib/types";
import type { StepProps } from "./steps";

/** Testing only: pick photos from files instead of the in-app camera. Never set in production. */
const ALLOW_UPLOAD = process.env.NEXT_PUBLIC_ALLOW_PHOTO_UPLOAD === "true";

const REQUIRED: { shot: PhotoShot; label: string }[] = [
  { shot: "bedroom", label: "Bedroom" }, { shot: "bathroom", label: "Bathroom" }, { shot: "kitchen", label: "Kitchen" },
  { shot: "meter", label: "Prepaid meter" }, { shot: "entrance", label: "Entrance" },
];
const MAX = 12;
const LABEL: Record<PhotoShot, string> = { bedroom: "Bedroom", bathroom: "Bathroom", kitchen: "Kitchen", meter: "Prepaid meter", entrance: "Entrance", extra: "Extra" };

/** Photos are taken with the in-app camera only (no gallery), resized on the phone and stamped with location. */
export function PhotosStep({ listing, reload, next, back }: StepProps) {
  const photos = [...listing.listing_photos].sort((a, b) => a.position - b.position);
  const missing = REQUIRED.filter((r) => !photos.some((p) => p.shot === r.shot));
  const [camera, setCamera] = useState(false);
  const [shot, setShot] = useState<PhotoShot>(missing[0]?.shot ?? "extra");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const here = useRef<{ lat: number; lng: number } | null>(null);

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => stop, []);

  const open = async (s: PhotoShot) => {
    setError(null);
    setShot(s);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      setCamera(true);
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = stream.current;
          void video.current.play();
        }
      });
      here.current = await position();
    } catch {
      setError("Allow camera access to take room photos.");
    }
  };

  // Stores one photo. Camera photos carry where they were taken; uploads (testing only) don't.
  const save = async (img: Shrunk, s: PhotoShot, at: { lat: number; lng: number } | null) => {
    const db = supabaseBrowser()!;
    const path = `${listing.id}/${crypto.randomUUID()}.${img.ext}`;
    const up = await db.storage.from("listing-photos").upload(path, img.blob, { contentType: img.blob.type, cacheControl: "31536000" });
    if (up.error) throw up.error;
    const ins = await db.from("listing_photos").insert({
      listing_id: listing.id, path, shot: s, position: photos.length, width: img.width, height: img.height,
      taken_at: new Date().toISOString(), taken_lat: at?.lat ?? null, taken_lng: at?.lng ?? null,
    });
    if (ins.error) throw ins.error;
    await reload();
  };

  const upload = async (s: PhotoShot, file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await save(await shrinkFile(file, 1600, 0.8), s, null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const snap = async () => {
    if (!video.current) return;
    setBusy(true);
    setError(null);
    try {
      await save(await shrink(video.current, 1600, 0.8), shot, here.current);
      const left = REQUIRED.filter((r) => r.shot !== shot && !photos.some((p) => p.shot === r.shot));
      if (left.length && photos.length + 1 < MAX) setShot(left[0].shot);
      else {
        stop();
        setCamera(false);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, path: string) => {
    const db = supabaseBrowser();
    if (!db) return;
    await db.from("listing_photos").delete().eq("id", id);
    await db.storage.from("listing-photos").remove([path]);
    await reload();
  };

  if (camera) {
    return (
      <div style={{ flex: 1, background: "#0A1410", color: "#fff", display: "flex", flexDirection: "column" }}>
        <div className="between" style={{ height: 60, padding: "0 12px" }}>
          <button className="ib" style={{ color: "#fff", background: "rgba(255,255,255,.12)" }} aria-label="Close camera" onClick={() => { stop(); setCamera(false); }}><X size={20} /></button>
          <span className="badge" style={{ background: "rgba(255,255,255,.12)", color: "#fff", height: 32 }}>{photos.length} of {missing.length ? REQUIRED.length : MAX}</span>
          <span style={{ width: 44 }} />
        </div>
        <div style={{ flex: 1, margin: "0 12px", borderRadius: 20, overflow: "hidden", position: "relative", background: "#000" }}>
          <video ref={video} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <span className="badge dark" style={{ position: "absolute", left: 12, top: 12 }}>{listing.area_name || "Abuja"} · {here.current ? "location on" : "finding location…"}</span>
          <span style={{ position: "absolute", left: 0, right: 0, bottom: 16, textAlign: "center", fontFamily: "var(--display)", fontWeight: 800, fontSize: 24, textShadow: "0 2px 12px rgba(0,0,0,.5)" }}>
            {shot === "extra" ? "Anything else" : `Show the ${LABEL[shot].toLowerCase()}`}
          </span>
        </div>
        <div className="chips scroll" style={{ margin: "12px 0 0", padding: "0 12px" }}>
          {[...REQUIRED.map((r) => r.shot), "extra" as const].map((s) => (
            <button key={s} onClick={() => setShot(s)} className="chip" style={{
              background: s === shot ? "var(--amber)" : "rgba(255,255,255,.14)", color: s === shot ? "var(--ink)" : "#fff", borderColor: "transparent",
              textDecoration: s !== "extra" && photos.some((p) => p.shot === s) ? "line-through" : "none",
            }}>{LABEL[s]}</button>
          ))}
        </div>
        {error && <p className="err" style={{ textAlign: "center", color: "#FFB4A9" }}>{error}</p>}
        <div style={{ height: 130, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <button onClick={snap} disabled={busy} aria-label="Take photo" style={{ width: 78, height: 78, borderRadius: 999, border: "4px solid #fff", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
            {busy ? <span className="spin" /> : <span style={{ width: 62, height: 62, borderRadius: 999, background: "#fff" }} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="body open" style={{ paddingTop: 20 }}>
        <h1 className="h1">{photos.length ? "Your photos" : "Take room photos"}</h1>
        {photos.length === 0 && <p className="sub">Five to start, up to 12. Taken here, at the room.</p>}
        {photos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {photos.map((p) => (
              <div key={p.id} className="photo" style={{ aspectRatio: "1", borderRadius: 12, position: "relative", backgroundImage: `url(${photoUrl(p.path)})` }}>
                <span className="badge dark" style={{ position: "absolute", left: 6, bottom: 6, fontSize: 11, padding: "3px 7px" }}>{LABEL[p.shot]}</span>
                {p.flagged && <span className="badge red" style={{ position: "absolute", left: 6, top: 6, fontSize: 11, padding: "3px 7px" }}><CircleAlert size={12} />Far from pin</span>}
                <button aria-label={`Remove ${LABEL[p.shot]} photo`} onClick={() => remove(p.id, p.path)}
                  style={{ position: "absolute", right: 4, top: 4, width: 32, height: 32, borderRadius: 999, border: 0, background: "rgba(0,0,0,.5)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
              </div>
            ))}
            {photos.length < MAX && (
              <button onClick={() => open(missing[0]?.shot ?? "extra")} style={{ aspectRatio: "1", borderRadius: 12, border: "1.5px dashed #C9D3CB", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "var(--green-text)" }}>
                <Plus size={22} />Add
              </button>
            )}
          </div>
        )}
        {missing.length > 0 && (
          <div className="stack" style={{ gap: 0 }}>
            <span className="lbl" style={{ paddingBottom: 6 }}>Still needed</span>
            {missing.map((m) => (
              <div key={m.shot} className="lrow" style={{ minHeight: 52 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--green)", margin: "0 6px" }} />
                <span style={{ flex: 1 }}>{m.label}</span>
                {ALLOW_UPLOAD && <UploadButton disabled={busy} onFile={(f) => upload(m.shot, f)} label={`Upload ${m.label.toLowerCase()} photo`} />}
              </div>
            ))}
          </div>
        )}
        {photos.length === 0 && <button className="btn" onClick={() => open("bedroom")}><Camera size={20} />Open camera</button>}
        {ALLOW_UPLOAD && missing.length === 0 && photos.length < MAX && (
          <UploadButton disabled={busy} onFile={(f) => upload("extra", f)} label="Upload an extra photo" wide />
        )}
        {ALLOW_UPLOAD && <p className="small">Testing: photo upload is on.</p>}
        {error && <p className="err" role="alert">{error}</p>}
      </div>
      <div className="foot split">
        <button className="link" onClick={back}>Back</button>
        <button className="next" disabled={missing.length > 0} onClick={next}>Next</button>
      </div>
    </>
  );
}

function UploadButton({ onFile, label, disabled, wide }: { onFile: (f: File | undefined) => void; label: string; disabled?: boolean; wide?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={wide ? "btn ghost" : "pill"} disabled={disabled} onClick={() => input.current?.click()} aria-label={label}>
        <ImageUp size={16} />{wide ? label : "Upload"}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}
