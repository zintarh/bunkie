import type { MetadataRoute } from "next";
import { ZONES } from "@/lib/places";
import { liveRoomIds } from "@/lib/rooms";
import { SITE_URL, areaSlug } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const page = (path: string, priority: number, freq: "daily" | "weekly" | "monthly" = "weekly") =>
    ({ url: `${SITE_URL}${path}`, changeFrequency: freq, priority });
  const rooms = await liveRoomIds().catch(() => []);
  return [
    page("/", 1, "weekly"),
    page("/abuja", 0.9, "daily"),
    ...ZONES.map((z) => page(`/abuja/${areaSlug(z.name)}`, 0.8, "daily")),
    page("/make-money-as-a-corper", 0.8, "monthly"),
    page("/partners", 0.7, "monthly"),
    page("/explore", 0.6, "daily"),
    page("/help", 0.4, "monthly"),
    page("/waitlist", 0.3, "monthly"),
    page("/terms", 0.1, "monthly"),
    page("/privacy", 0.1, "monthly"),
    ...rooms.map((r) => ({ url: `${SITE_URL}/rooms/${r.id}`, lastModified: r.updated ?? undefined, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
