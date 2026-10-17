"use client";
import { useRef } from "react";
import { Camera, Check, FileUp, Trash2 } from "lucide-react";
import { PhotoError, shrinkFile } from "@/lib/image";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Take a photo of a document or upload one (image or PDF). */
export function DocPicker({ label, file, setFile }: { label: string; file: File | null; setFile: (f: File | null) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  return (
    <div className="stack">
      <span className="lbl">{label}</span>
      {file ? (
        <div className="soft row">
          <span className="tile t-mint"><Check size={20} /></span>
          <span className="stack" style={{ gap: 0, flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
            <span className="small">{(file.size / 1048576).toFixed(1)} MB</span>
          </span>
          <button className="ib" aria-label="Remove file" onClick={() => setFile(null)}><Trash2 size={18} /></button>
        </div>
      ) : (
        <div className="grid2">
          <button className="btn ghost sm" onClick={() => camera.current?.click()}><Camera size={18} />Take photo</button>
          <button className="btn ghost sm" onClick={() => upload.current?.click()}><FileUp size={18} />Upload file</button>
        </div>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <input ref={upload} type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}

/** Uploads a verification document to the private kyc bucket; returns its path. */
export async function uploadDoc(userId: string, name: string, file: File): Promise<string> {
  const db = supabaseBrowser()!;
  let blob: Blob = file;
  let ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  if (file.type === "application/pdf" && file.size > 5 * 1024 * 1024) throw new PhotoError("That PDF is too big. Pick one under 5 MB, or take a photo of it.");
  if (file.type !== "application/pdf") {
    const s = await shrinkFile(file, 2000, 0.85, 4_500_000);
    blob = s.blob;
    ext = s.ext;
  }
  const path = `${userId}/${name}-${Date.now()}.${ext}`;
  const { error } = await db.storage.from("kyc").upload(path, blob, { contentType: blob.type || "application/pdf" });
  if (error) throw error;
  return path;
}
