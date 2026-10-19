import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Only the public pages are worth crawling; everything behind sign-in is left out.
const PRIVATE = ["/admin", "/api", "/auth", "/account", "/bookings", "/inbox", "/profile", "/saved", "/host", "/request", "/verify", "/reset", "/login", "/signup", "/questions", "/start", "/want", "/ppa"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
