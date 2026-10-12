/** Rough minutes by road, matching public.estimate_minutes() in SQL (about 2.6 min/km + 6 min). */
export function estimateMinutes(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  const km = (2 * 6371000 * Math.asin(Math.sqrt(h))) / 1000;
  return Math.round(km * 2.6 + 6);
}
