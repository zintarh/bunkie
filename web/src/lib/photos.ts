import { SUPABASE_URL } from "./supabase/config";

/**
 * Public URL for a listing photo at a given width. Paths starting with "/" are bundled demo images.
 * Supabase resizes on the fly and the CDN caches each size; file names never change, so caching is safe.
 */
export function photoUrl(path: string | null | undefined, width: 400 | 1080 = 400): string {
  if (!path) return "/demo/room-1.svg";
  if (path.startsWith("/") || path.startsWith("http")) return path;
  return `${SUPABASE_URL}/storage/v1/render/image/public/listing-photos/${path}?width=${width}&quality=70&resize=contain`;
}

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("/") || path.startsWith("http")) return path;
  return `${SUPABASE_URL}/storage/v1/render/image/public/avatars/${path}?width=160&quality=70`;
}
