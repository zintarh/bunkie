"use client";
import { useState } from "react";
import { Camera } from "lucide-react";
import { refreshMe } from "@/lib/auth";
import { initial } from "@/lib/format";
import { PhotoError, shrinkFile } from "@/lib/image";
import { avatarUrl } from "@/lib/photos";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Shrinks, uploads and sets the person's photo. Returns the stored path. */
export async function saveAvatar(userId: string, file: File): Promise<string> {
  const db = supabaseBrowser();
  if (!db) throw new Error("offline");
  // 640px is plenty for an avatar and stays well under the bucket's 512 KB limit.
  const img = await shrinkFile(file, 640, 0.82, 500_000);
  const path = `${userId}/${crypto.randomUUID()}.${img.ext}`;
  const up = await db.storage.from("avatars").upload(path, img.blob, { contentType: img.blob.type });
  if (up.error) throw up.error;
  const { error } = await db.from("profiles").update({ photo_path: path }).eq("id", userId);
  if (error) throw error;
  return path;
}

/** The signed-in person's photo. Tap to add one, or to change it. */
export function AvatarPicker({ userId, name, path, size = 56 }: { userId: string; name: string; path: string | null; size?: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const src = preview ?? avatarUrl(path);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setPreview(URL.createObjectURL(file));
    try {
      await saveAvatar(userId, file);
      await refreshMe();
    } catch (e) {
      setPreview(null);
      setError(e instanceof PhotoError ? e.message : "Couldn’t save your photo. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="stack" style={{ gap: 4, alignItems: "center", flexShrink: 0 }}>
      <label className="avatar-pick" style={{ width: size, height: size }} aria-label={src ? "Change your photo" : "Add your photo"} aria-busy={busy}>
        <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
          {src ? <img src={src} alt="" /> : initial(name)}
        </span>
        <span className="avatar-pick-badge">{busy ? <span className="spin" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <Camera size={12} strokeWidth={2.6} />}</span>
        <input type="file" accept="image/*" className="sr-only" disabled={busy}
          onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {error && <span className="small" role="alert" style={{ color: "var(--red)", maxWidth: 140, textAlign: "center" }}>{error}</span>}
    </span>
  );
}
