"use client";

/** Can this browser encode WebP from a canvas? (Safari can't, so iPhones get JPEG.) */
let webp: boolean | null = null;
function canWebp(): boolean {
  if (webp === null) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    webp = c.toDataURL("image/webp").startsWith("data:image/webp");
  }
  return webp;
}

export type Shrunk = { blob: Blob; ext: "webp" | "jpg"; width: number; height: number };

/** A photo problem the person can fix; the message is shown as is. */
export class PhotoError extends Error {}

/** Biggest file we'll try to open. Phone photos are 2-12 MB; past this, decoding can run a phone out of memory. */
export const MAX_PHOTO_INPUT = 25 * 1024 * 1024;
/** Every photo bucket takes up to 1 MB (avatars 512 KB), so results are kept under this by default. */
const DEFAULT_MAX_BYTES = 1_000_000;

function encode(source: CanvasImageSource, w0: number, h0: number, maxEdge: number, quality: number): Promise<Shrunk> {
  const scale = Math.min(1, maxEdge / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new PhotoError("Your phone couldn’t process that photo. Try another one."));
  ctx.drawImage(source, 0, 0, width, height);
  const type = canWebp() ? "image/webp" : "image/jpeg";
  return new Promise<Shrunk>((res, rej) => canvas.toBlob(
    (b) => (b ? res({ blob: b, ext: type === "image/webp" ? "webp" : "jpg", width, height })
      : rej(new PhotoError("Your phone couldn’t process that photo. Try another one."))),
    type, quality,
  ));
}

/**
 * Resizes to `maxEdge` on the long side and re-encodes (~150-250 KB for a 1600px room photo).
 * Re-encoding also drops EXIF, including any GPS the camera wrote. If the result is still over
 * `maxBytes` (very detailed photos), it steps the quality and then the size down until it fits.
 */
export async function shrink(source: CanvasImageSource & { width?: number; height?: number }, maxEdge = 1600, quality = 0.8, maxBytes = DEFAULT_MAX_BYTES): Promise<Shrunk> {
  const w0 = (source as HTMLVideoElement).videoWidth || (source as HTMLImageElement).naturalWidth || (source as ImageBitmap).width;
  const h0 = (source as HTMLVideoElement).videoHeight || (source as HTMLImageElement).naturalHeight || (source as ImageBitmap).height;
  if (!w0 || !h0) throw new PhotoError("That photo looks empty. Try another one.");
  let edge = maxEdge;
  let q = quality;
  for (let tries = 0; tries < 6; tries++) {
    const out = await encode(source, w0, h0, edge, q);
    if (out.blob.size <= maxBytes) return out;
    if (q > 0.55) q = Math.max(0.55, q - 0.12);
    else edge = Math.round(edge * 0.75);
  }
  throw new PhotoError("That photo is too detailed to send. Try another one.");
}

/** Opens a picked file as something we can draw, with a fallback for browsers without createImageBitmap. */
async function open(file: File): Promise<{ source: CanvasImageSource; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, close: () => bmp.close() };
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoError(/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
      ? "This phone saves photos as HEIC, which we can’t open here. Take a screenshot of it, or pick a JPG or PNG."
      : "We couldn’t open that photo. Try a JPG or PNG.");
  }
  return { source: img, close: () => URL.revokeObjectURL(url) };
}

/** Checks a picked file, then shrinks it. Throws PhotoError with a plain message when it can't. */
export async function shrinkFile(file: File, maxEdge = 1600, quality = 0.8, maxBytes = DEFAULT_MAX_BYTES): Promise<Shrunk> {
  if (file.type && !file.type.startsWith("image/")) throw new PhotoError("That file isn’t a photo. Pick a JPG or PNG.");
  if (file.size === 0) throw new PhotoError("That photo is empty. Try another one.");
  if (file.size > MAX_PHOTO_INPUT) throw new PhotoError("That photo is too big. Pick one under 25 MB.");
  const { source, close } = await open(file);
  try {
    return await shrink(source as CanvasImageSource & { width?: number; height?: number }, maxEdge, quality, maxBytes);
  } finally {
    close();
  }
}

/** Current position, or null if the person says no or it takes too long. */
export function position(timeout = 8000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
  });
}
