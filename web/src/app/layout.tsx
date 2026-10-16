import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { DesktopFrame } from "@/components/DesktopFrame";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-bricolage", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Bunkie", template: "%s · Bunkie" },
  description: "Leave camp with a place to stay. Verified shared rooms for corp members in Abuja.",
  appleWebApp: { capable: true, title: "Bunkie", statusBarStyle: "default" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#17A862",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={`${bricolage.variable} ${figtree.variable}`}>
      <body>
        <DesktopFrame>{children}</DesktopFrame>
        <ServiceWorker />
      </body>
    </html>
  );
}
