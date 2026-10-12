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

/**
 * Resizes to `maxEdge` on the long side and re-encodes (~150-250 KB for a 1600px room photo).
 * Re-encoding also drops EXIF, including any GPS the camera wrote.
 */
export async function shrink(source: CanvasImageSource & { width?: number; height?: number }, maxEdge = 1600, quality = 0.8): Promise<Shrunk> {
  const w0 = (source as HTMLVideoElement).videoWidth || (source as HTMLImageElement).naturalWidth || (source as ImageBitmap).width;
  const h0 = (source as HTMLVideoElement).videoHeight || (source as HTMLImageElement).naturalHeight || (source as ImageBitmap).height;
  const scale = Math.min(1, maxEdge / Math.max(w0, h0));
  const width = Math.round(w0 * scale);
  const height = Math.round(h0 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(source, 0, 0, width, height);
  const type = canWebp() ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), type, quality));
  return { blob, ext: type === "image/webp" ? "webp" : "jpg", width, height };
}

export async function shrinkFile(file: File, maxEdge = 1600, quality = 0.8): Promise<Shrunk> {
  const bmp = await createImageBitmap(file);
  try {
    return await shrink(bmp, maxEdge, quality);
  } finally {
    bmp.close();
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
