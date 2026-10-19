import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon, ChevronDownIcon } from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { LandingFooter, LandingNav } from "@/components/LandingChrome";
import { SeoRoomTile } from "@/components/SeoRoomTile";
import { ZONES } from "@/lib/places";
import { searchRooms } from "@/lib/rooms";
import { SITE_URL, areaSlug } from "@/lib/site";
import base from "../landing.module.css";
import styles from "./seo.module.css";

export const revalidate = 300;

const title = "Rooms and shared apartments for rent in Abuja · for corp members";
const description = "Find a room in Abuja for your service year: shared rooms, own rooms and self contains in Wuse, Garki, Utako, Gwarinpa, Kubwa and more. Verified hosts, book from NYSC camp.";

export const metadata: Metadata = {
  title: { absolute: `${title} | Bunkie` },
  description,
  alternates: { canonical: "/abuja" },
  openGraph: { title, description, url: "/abuja", type: "website" },
};

const FAQ = [
  { q: "Where should a corper live in Abuja?", a: "Close to your PPA. Central areas like Wuse, Garki and Utako cost more; Kubwa, Lugbe, Nyanya and Gwarinpa cost less with a longer ride. Bunkie shows the travel time from each room to your PPA." },
  { q: "Can I rent a room for just a few months?", a: "Yes. Stays run from one month to the rest of your service year, and some hosts take stays of a few weeks." },
  { q: "Do I have to pay a full year upfront?", a: "Not always. Many rooms are paid monthly, inside the app, and each room shows how it’s paid." },
  { q: "Can I find a room before I leave camp?", a: "Yes. Video call your host from camp and move in on exit day." },
];

export default async function Abuja() {
  const rooms = await searchRooms({ mode: "any" }).catch(() => []);
  const count = new Map<string, number>();
  rooms.forEach((r) => count.set(r.area_name, (count.get(r.area_name) ?? 0) + 1));

  return (
    <div className={base.page} data-full>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Bunkie", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Abuja", item: `${SITE_URL}/abuja` },
            ],
          },
          { "@type": "FAQPage", mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
        ],
      }} />
      <LandingNav links={[{ href: "#areas", label: "Areas" }, { href: "/partners", label: "Host partners" }]} cta={{ href: "/welcome", label: "Find your bunkie" }} />

      <section className={`${base.wrap} ${styles.hero}`}>
        <nav className={styles.crumbs} aria-label="Breadcrumb"><Link href="/">Bunkie</Link>/<span>Abuja</span></nav>
        <h1>Rooms for rent in Abuja for corp members</h1>
        <p className={styles.lede}>Shared rooms, own rooms and self contains across Abuja, from verified hosts. Pay monthly, move in on your camp exit day.</p>
        <div className={styles.ctas}>
          <Link href="/welcome" className={styles.ctaMain}>Find your bunkie<ArrowIcon size={18} /></Link>
          <Link href="/explore" className={styles.ctaGhost}>See all rooms</Link>
        </div>
      </section>

      {rooms.length > 0 && (
        <section className={`${base.wrap} ${styles.block}`}>
          <h2>Rooms available now</h2>
          <div className={styles.tiles}>{rooms.slice(0, 12).map((r) => <SeoRoomTile key={r.id} room={r} />)}</div>
        </section>
      )}

      <section id="areas" className={`${base.wrap} ${styles.block}`}>
        <h2>Rooms by area</h2>
        <div className={styles.areas}>
          {ZONES.map((z) => (
            <Link key={z.id} href={`/abuja/${areaSlug(z.name)}`}>{z.name}{count.get(z.name) ? <span>{count.get(z.name)}</span> : null}</Link>
          ))}
        </div>
      </section>

      <section className={`${base.wrap} ${base.narrow} ${styles.block}`} style={{ marginLeft: "auto", marginRight: "auto" }}>
        <h2>Renting in Abuja as a corper</h2>
        <div className={base.faq}>
          {FAQ.map(({ q, a }) => (
            <details key={q}>
              <summary>{q}<ChevronDownIcon size={20} /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={`${base.wrap} ${styles.block}`}>
        <div className={styles.empty}>
          <h2 style={{ marginBottom: 0 }}>Already serving in Abuja?</h2>
          <p>Host a new corper in your spare room and earn from it.</p>
          <Link href="/make-money-as-a-corper" className={styles.ctaMain}>How hosting works</Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
