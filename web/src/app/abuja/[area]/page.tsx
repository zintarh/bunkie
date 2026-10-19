import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowIcon, ChevronDownIcon } from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { LandingFooter, LandingNav } from "@/components/LandingChrome";
import { SeoRoomTile } from "@/components/SeoRoomTile";
import { estimateMinutes } from "@/lib/estimate";
import { naira } from "@/lib/format";
import { ZONES } from "@/lib/places";
import { searchRooms } from "@/lib/rooms";
import { AREA_NOTES, SITE_URL, areaSlug, zoneBySlug } from "@/lib/site";
import base from "../../landing.module.css";
import styles from "../seo.module.css";

export const revalidate = 300;
export const dynamicParams = false;

type Props = { params: Promise<{ area: string }> };

export function generateStaticParams() {
  return ZONES.map((z) => ({ area: areaSlug(z.name) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const zone = zoneBySlug((await params).area);
  if (!zone) return {};
  const title = `Rooms for rent in ${zone.name}, Abuja · for corp members`;
  const description = `Shared rooms, own rooms and self contains for rent in ${zone.name}, Abuja. Verified hosts, monthly or short stays, book from NYSC camp.`;
  const path = `/abuja/${areaSlug(zone.name)}`;
  return { title: { absolute: `${title} | Bunkie` }, description, alternates: { canonical: path }, openGraph: { title, description, url: path, type: "website" } };
}

export default async function AreaPage({ params }: Props) {
  const zone = zoneBySlug((await params).area);
  if (!zone) notFound();

  const all = await searchRooms({ mode: "any", zone: zone.id }).catch(() => []);
  const here = all.filter((r) => r.area_name === zone.name);
  const near = all.filter((r) => r.area_name !== zone.name).sort((a, b) => (a.commute_min ?? 99) - (b.commute_min ?? 99)).slice(0, 6);
  const prices = here.map((r) => r.monthly_total).sort((a, b) => a - b);

  const centre = ZONES[0];
  const neighbours = ZONES.filter((z) => z.id !== zone.id)
    .map((z) => ({ z, min: estimateMinutes(zone.lat, zone.lng, z.lat, z.lng) }))
    .sort((a, b) => a.min - b.min);

  const faq = [
    {
      q: `How much is a room in ${zone.name}?`,
      a: prices.length
        ? `Rooms on Bunkie in ${zone.name} go for ${naira(prices[0])}${prices.length > 1 ? ` to ${naira(prices[prices.length - 1])}` : ""} a month right now. Hosts set their own prices.`
        : `Hosts set their own prices. Check the rooms near ${zone.name} above, or tell hosts what you’re looking for.`,
    },
    { q: `Can I book a room in ${zone.name} while I’m in NYSC camp?`, a: "Yes. Video call your host from camp, pay in the app and move in on exit day." },
    { q: "Can I stay for a few weeks only?", a: "Yes, if the host opts in to short stays. Otherwise stays run from one month to the rest of your service year." },
    { q: "Is it safe?", a: "Every host is verified, you choose a women only, men only or mixed home, and you only ever pay inside Bunkie." },
  ];

  const path = `/abuja/${areaSlug(zone.name)}`;

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
              { "@type": "ListItem", position: 3, name: zone.name, item: `${SITE_URL}${path}` },
            ],
          },
          {
            "@type": "FAQPage",
            mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
          },
        ],
      }} />
      <LandingNav links={[{ href: "/abuja", label: "All of Abuja" }, { href: "/partners", label: "Host partners" }]} cta={{ href: "/welcome", label: "Find your bunkie" }} />

      <section className={`${base.wrap} ${styles.hero}`}>
        <nav className={styles.crumbs} aria-label="Breadcrumb"><Link href="/">Bunkie</Link>/<Link href="/abuja">Abuja</Link>/<span>{zone.name}</span></nav>
        <h1>Rooms for rent in {zone.name}, Abuja</h1>
        <p className={styles.lede}>Shared rooms, own rooms and self contains in {zone.name}, from verified hosts. Built for corp members.</p>
        <div className={styles.ctas}>
          <Link href="/welcome" className={styles.ctaMain}>Find your bunkie<ArrowIcon size={18} /></Link>
          <Link href="/explore" className={styles.ctaGhost}>See all rooms</Link>
        </div>
      </section>

      <section className={`${base.wrap} ${styles.block}`}>
        <h2>{here.length ? `${here.length} ${here.length === 1 ? "room" : "rooms"} in ${zone.name}` : `Rooms in ${zone.name}`}</h2>
        {here.length ? (
          <div className={styles.tiles}>{here.map((r) => <SeoRoomTile key={r.id} room={r} />)}</div>
        ) : (
          <div className={styles.empty}>
            <p>No rooms listed in {zone.name} right now. Tell hosts what you’re looking for and they’ll reach out.</p>
            <Link href="/want" className={styles.ctaMain}>Post what you need</Link>
          </div>
        )}
      </section>

      {near.length > 0 && (
        <section className={`${base.wrap} ${styles.block}`}>
          <h2>Rooms near {zone.name}</h2>
          <div className={styles.tiles}>{near.map((r) => <SeoRoomTile key={r.id} room={r} />)}</div>
        </section>
      )}

      <section className={`${base.wrap} ${styles.block}`}>
        <h2>Living in {zone.name}</h2>
        <p>{AREA_NOTES[zone.name]}</p>
        <div className={styles.facts} style={{ marginTop: 24 }}>
          {zone.id !== centre.id && (
            <div className={styles.fact}><b>~{estimateMinutes(zone.lat, zone.lng, centre.lat, centre.lng)} min</b><span>to the Central Area by road</span></div>
          )}
          {neighbours.slice(0, 3).map(({ z, min }) => (
            <div key={z.id} className={styles.fact}><b>~{min} min</b><span>to {z.name}</span></div>
          ))}
        </div>
      </section>

      <section className={`${base.wrap} ${base.narrow} ${styles.block}`} style={{ marginLeft: "auto", marginRight: "auto" }}>
        <h2>Questions about {zone.name}</h2>
        <div className={base.faq}>
          {faq.map(({ q, a }) => (
            <details key={q}>
              <summary>{q}<ChevronDownIcon size={20} /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={`${base.wrap} ${styles.block}`}>
        <h2>Other areas in Abuja</h2>
        <div className={styles.areas}>
          {neighbours.map(({ z }) => <Link key={z.id} href={`/abuja/${areaSlug(z.name)}`}>{z.name}</Link>)}
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
