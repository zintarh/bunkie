import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bunkie",
    short_name: "Bunkie",
    description: "Leave camp with a place to stay.",
    start_url: "/welcome",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#17A862",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
