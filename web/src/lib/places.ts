// Mirrors supabase/seed.sql. Used by the app for pickers before any request reaches the database.
export type Zone = { id: number; name: string; lat: number; lng: number };
export const ZONES: Zone[] = [
  { id: 1, name: "Central Area", lat: 9.0579, lng: 7.4951 },
  { id: 2, name: "Garki", lat: 9.0300, lng: 7.4880 },
  { id: 3, name: "Wuse", lat: 9.0700, lng: 7.4800 },
  { id: 4, name: "Wuse 2", lat: 9.0790, lng: 7.4700 },
  { id: 5, name: "Maitama", lat: 9.0880, lng: 7.4930 },
  { id: 6, name: "Asokoro", lat: 9.0430, lng: 7.5270 },
  { id: 7, name: "Utako", lat: 9.0700, lng: 7.4400 },
  { id: 8, name: "Jabi", lat: 9.0700, lng: 7.4200 },
  { id: 9, name: "Wuye", lat: 9.0600, lng: 7.4550 },
  { id: 10, name: "Mabushi", lat: 9.0800, lng: 7.4550 },
  { id: 11, name: "Jahi", lat: 9.0900, lng: 7.4500 },
  { id: 12, name: "Kado", lat: 9.0900, lng: 7.4300 },
  { id: 13, name: "Life Camp", lat: 9.0800, lng: 7.4000 },
  { id: 14, name: "Gwarinpa", lat: 9.1100, lng: 7.4000 },
  { id: 15, name: "Katampe", lat: 9.1100, lng: 7.4500 },
  { id: 16, name: "Dawaki", lat: 9.1300, lng: 7.4100 },
  { id: 17, name: "Kubwa", lat: 9.1500, lng: 7.3300 },
  { id: 18, name: "Dutse", lat: 9.1500, lng: 7.4500 },
  { id: 19, name: "Mpape", lat: 9.1200, lng: 7.4900 },
  { id: 20, name: "Bwari", lat: 9.2800, lng: 7.3800 },
  { id: 21, name: "Durumi", lat: 9.0200, lng: 7.4600 },
  { id: 22, name: "Gudu", lat: 9.0100, lng: 7.4700 },
  { id: 23, name: "Apo", lat: 9.0000, lng: 7.5000 },
  { id: 24, name: "Lokogoma", lat: 8.9900, lng: 7.4600 },
  { id: 25, name: "Galadimawa", lat: 9.0000, lng: 7.4300 },
  { id: 26, name: "Lugbe", lat: 8.9800, lng: 7.3800 },
  { id: 27, name: "Idu", lat: 9.0300, lng: 7.3500 },
  { id: 28, name: "Nyanya", lat: 9.0200, lng: 7.5700 },
  { id: 29, name: "Karu", lat: 9.0100, lng: 7.5500 },
  { id: 30, name: "Kuje", lat: 8.8800, lng: 7.2300 },
  { id: 31, name: "Gwagwalada", lat: 8.9400, lng: 7.0800 },
];

export type Batch = { id: string; year: number; batch: "A" | "B" | "C"; stream: 1 | 2; campEnd: string };
export const BATCHES: Batch[] = [
  { id: "2025-A1", year: 2025, batch: "A", stream: 1, campEnd: "2025-05-26" },
  { id: "2025-A2", year: 2025, batch: "A", stream: 2, campEnd: "2025-06-30" },
  { id: "2025-B1", year: 2025, batch: "B", stream: 1, campEnd: "2025-10-20" },
  { id: "2025-B2", year: 2025, batch: "B", stream: 2, campEnd: "2025-10-31" },
  { id: "2025-C1", year: 2025, batch: "C", stream: 1, campEnd: "2026-02-16" },
  { id: "2025-C2", year: 2025, batch: "C", stream: 2, campEnd: "2026-03-23" },
  { id: "2026-A1", year: 2026, batch: "A", stream: 1, campEnd: "2026-05-26" },
  { id: "2026-A2", year: 2026, batch: "A", stream: 2, campEnd: "2026-06-30" },
  { id: "2026-B1", year: 2026, batch: "B", stream: 1, campEnd: "2026-10-20" },
  { id: "2026-B2", year: 2026, batch: "B", stream: 2, campEnd: "2026-10-31" },
  { id: "2026-C1", year: 2026, batch: "C", stream: 1, campEnd: "2027-02-16" },
  { id: "2026-C2", year: 2026, batch: "C", stream: 2, campEnd: "2027-03-23" },
];

/** Nearest zone to a point, for turning a PPA address into a commute zone. */
export function nearestZone(lat: number, lng: number): Zone {
  let best = ZONES[0];
  let bestD = Infinity;
  for (const z of ZONES) {
    const d = (z.lat - lat) ** 2 + ((z.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) { bestD = d; best = z; }
  }
  return best;
}

/** The batch a state code belongs to, e.g. FC/26B/1234 -> 2026 Batch B (stream isn't in the code). */
export function batchFromStateCode(code: string): { year: number; batch: "A" | "B" | "C" } | null {
  const m = code.match(/^[A-Z]{2}\/(\d{2})([ABC])\/\d{3,5}$/);
  return m ? { year: 2000 + Number(m[1]), batch: m[2] as "A" | "B" | "C" } : null;
}
