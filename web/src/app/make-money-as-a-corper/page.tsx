import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon, ChevronDownIcon } from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { LandingFooter, LandingNav } from "@/components/LandingChrome";
import { SITE_URL } from "@/lib/site";
import base from "../landing.module.css";
import styles from "../abuja/seo.module.css";

const title = "How to make money as a corper in Abuja";
const description = "Earn on top of your allawee during NYSC: host a new corp member in your spare room with Bunkie, plus other side hustles that fit around your PPA and CDS.";

export const metadata: Metadata = {
  title: { absolute: `${title} | Bunkie` },
  description,
  alternates: { canonical: "/make-money-as-a-corper" },
  openGraph: { title, description, url: "/make-money-as-a-corper", type: "article" },
};

const STEPS = [
  { title: "List your spare room or bed space", text: "Take photos in the app, set your price and your house rules." },
  { title: "A new corper requests to bunk with you", text: "You see who they are and how they live before you say yes." },
  { title: "They pay in the app", text: "Rent is paid through Bunkie, so there’s no chasing anyone for money." },
  { title: "You get paid", text: "After they move in, then for each week or month they stay." },
];

const MORE = [
  { title: "Tutoring", text: "Lesson classes for secondary school students, or JAMB and WAEC prep, after PPA hours and on weekends." },
  { title: "Freelancing", text: "Writing, design, social media management or coding for clients online." },
  { title: "Selling what you make or source", text: "Food, small chops, clothes or skincare to fellow corpers at CDS and at your PPA." },
  { title: "Your SAED skill", text: "Turn what you learn in camp, like baking, tailoring or photography, into paid work." },
];

const FAQ = [
  { q: "Can a corper make money during NYSC?", a: "Yes, as long as it doesn’t get in the way of your PPA and CDS. Hosting with Bunkie fits around both: your bunkie lives with you while you go about your day." },
  { q: "How much can I earn hosting a bunkie?", a: "You set the price. For example, a bunkie paying ₦50,000 a month for six months pays ₦300,000 in rent." },
  { q: "Do I need my own apartment?", a: "You need a room or bed space you can share, and your landlord’s permission if your lease asks for it." },
  { q: "Do I have to be a corper to host?", a: "No. Anyone with a room in Abuja can host. Corper hosts wear a badge and get a boost in search." },
];

export default function MakeMoney() {
  return (
    <div className={base.page} data-full>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "HowTo",
            name: "How to make money hosting a corper with Bunkie",
            step: STEPS.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.title, text: s.text })),
          },
          { "@type": "FAQPage", mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
          { "@type": "BreadcrumbList", itemListElement: [
            { "@type": "ListItem", position: 1, name: "Bunkie", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: title, item: `${SITE_URL}/make-money-as-a-corper` },
          ] },
        ],
      }} />
      <LandingNav links={[{ href: "#host", label: "Host a bunkie" }, { href: "#more", label: "More ideas" }]} cta={{ href: "/host", label: "Become a host" }} />

      <section className={`${base.wrap} ${styles.hero}`}>
        <nav className={styles.crumbs} aria-label="Breadcrumb"><Link href="/">Bunkie</Link>/<span>Make money as a corper</span></nav>
        <h1>How to make money as a corper in Abuja</h1>
        <p className={styles.lede}>Your spare room can pay you. Host a new corp member as their bunkie and share your rent, without a second job.</p>
        <div className={styles.ctas}>
          <Link href="/host" className={styles.ctaMain}>Become a host<ArrowIcon size={18} /></Link>
          <Link href="/partners" className={styles.ctaGhost}>How hosting works</Link>
        </div>
      </section>

      <section id="host" className={`${base.wrap} ${styles.block}`}>
        <h2>Host a bunkie</h2>
        <p>Every batch, new corpers arrive in Abuja needing somewhere to stay after camp. If you’re already settled, you can host one in your room or a spare bed space, for a few weeks or for the rest of their service year.</p>
        <ol className={styles.list} style={{ marginTop: 28 }}>
          {STEPS.map((s, i) => (
            <li key={s.title} className={i === 0 ? styles.listMain : undefined}>
              <h3>{i + 1}. {s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="more" className={`${base.wrap} ${styles.block}`}>
        <h2>More ways corpers earn</h2>
        <ul className={styles.list}>
          {MORE.map((m) => (
            <li key={m.title}><h3>{m.title}</h3><p>{m.text}</p></li>
          ))}
        </ul>
      </section>

      <section className={`${base.wrap} ${base.narrow} ${styles.block}`} style={{ marginLeft: "auto", marginRight: "auto" }}>
        <h2>Questions</h2>
        <div className={base.faq}>
          {FAQ.map(({ q, a }) => (
            <details key={q}>
              <summary>{q}<ChevronDownIcon size={20} /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
