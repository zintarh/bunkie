import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Check, ChevronDown, Clock, Lock, MessageCircle, Search, ShieldCheck, Sparkles, Tent, Video, Wallet } from "lucide-react";
import { BunkIcon, HostIcon } from "@/components/icons";
import { BunkMark } from "@/components/ui";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: { absolute: "Bunkie · Leave camp with a place to stay" },
  description: "Verified shared rooms near your PPA in Abuja. Find your bunkie, see the room, pay safely in the app.",
  openGraph: {
    title: "Bunkie · Leave camp with a place to stay",
    description: "Verified shared rooms near your PPA in Abuja.",
    type: "website",
  },
};

const STEPS = [
  { Icon: Search, title: "Search near your PPA", text: "Type what you want, like “self con near Utako under 80k”." },
  { Icon: Video, title: "See it first", text: "Inspect in person, or by video call from camp. Chat in Bunkie." },
  { Icon: Wallet, title: "Pay, then move in", text: "Your money is held until you move in." },
];

const SAFETY = [
  { Icon: BadgeCheck, tone: styles.tMint, title: "Every host is verified", text: "ID and selfie checks before a room goes live." },
  { Icon: ShieldCheck, tone: styles.tAmber, title: "Your money is held", text: "Paid through Paystack and released after you move in. Refunded if the room isn’t as listed." },
  { Icon: Lock, tone: styles.tSky, title: "Numbers stay private", text: "Phone numbers and account details stay hidden until you pay." },
  { Icon: Sparkles, tone: styles.tLilac, title: "Corper hosts first", text: "Rooms from serving and past corpers show up first." },
];

const FAQ = [
  { q: "Is Bunkie only in Abuja?", a: <>For now, yes. <Link href="/waitlist">Join the waitlist</Link> for your state.</> },
  { q: "How do I pay?", a: "Only inside Bunkie, by card, transfer or USSD through Paystack. Never to a personal account." },
  { q: "When does the host get paid?", a: "24 hours after you move in, if nothing is wrong." },
  { q: "What’s an inspection fee?", a: "Some hosts charge up to ₦5,000 to inspect in person. Bunkie holds it, refunds it if the host cancels, and takes it off your rent if you book." },
  { q: "Can I book while I’m still in camp?", a: "Yes. View the room by video call and move in on your camp exit day." },
  { q: "What does it cost to use?", a: "Searching, chatting and requesting are free. Paystack’s charge is added when you pay." },
];

export default function Landing() {
  return (
    <div className={styles.page} data-full>
      <header className={styles.nav}>
        <div className={styles.wrap}>
          <Link href="/" className={styles.brand} aria-label="Bunkie home">
            <i><BunkMark /></i>bunkie
          </Link>
          <nav className={styles.links} aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#safety">Safety</a>
            <a href="#hosts">Hosting</a>
            <a href="#faq">FAQ</a>
          </nav>
          <Link href="/welcome" className={styles.navCta}>Find a room</Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={`${styles.wrap} ${styles.heroGrid}`}>
          <div className={styles.heroText}>
            <span className={styles.eyebrow}><Tent size={15} />For corp members in Abuja</span>
            <h1>Leave camp with a place to stay.</h1>
            <p>Verified shared rooms near your PPA. Find your bunkie, see the room, pay safely in the app.</p>
            <div className={styles.ctas}>
              <Link href="/welcome" className={styles.ctaMain}>Find a room</Link>
              <Link href="/host" className={styles.ctaGhost}>Host a corper</Link>
            </div>
            <ul className={styles.ticks}>
              <li><Check size={16} />Verified hosts</li>
              <li><Check size={16} />Pay only in Bunkie</li>
              <li><Check size={16} />Book from camp</li>
            </ul>
          </div>

          <div className={styles.phoneArea} aria-hidden="true">
            <div className={styles.phone}>
              <div className={styles.screen}>
                <div className={styles.appHero}>
                  <span className={styles.appBrand}><i><BunkMark /></i>bunkie</span>
                  <span className={styles.appSearch}><Sparkles size={14} />self con near Utako under 80k</span>
                  <span className={styles.appChips}><b>Near Utako</b><b>Under ₦80k</b><b>Self contain</b></span>
                </div>
                <div className={styles.appList}>
                  <div className={styles.card}>
                    <div className={styles.cardImg} style={{ backgroundImage: "url(/demo/room-1.svg)" }}>
                      <span className={styles.badgeAmber}><Sparkles size={11} />Corper host</span>
                    </div>
                    <div className={styles.cardRow}><b>₦72,000<small> /month</small></b><span className={styles.mins}><Clock size={11} />8 min</span></div>
                    <span className={styles.cardSub}>Self contain in Utako · Amaka</span>
                  </div>
                  <div className={styles.card}>
                    <div className={styles.cardImg} style={{ backgroundImage: "url(/demo/room-3.svg)" }}>
                      <span className={styles.badgeWhite}><BadgeCheck size={11} />Verified host</span>
                    </div>
                    <div className={styles.cardRow}><b>₦65,000<small> /month</small></b><span className={styles.mins}><Clock size={11} />12 min</span></div>
                    <span className={styles.cardSub}>Self contain in Jabi · Tunde</span>
                  </div>
                </div>
              </div>
            </div>
            <div className={`${styles.float} ${styles.floatA}`}><span className={styles.dotGreen}><MessageCircle size={14} /></span>Amaka accepted your request</div>
            <div className={`${styles.float} ${styles.floatB}`}><span className={styles.dotAmber}><Wallet size={14} /></span>Paid · held until you move in</div>
          </div>
        </div>
      </section>

      <section id="how" className={styles.section}>
        <div className={styles.wrap}>
          <h2>How it works</h2>
          <ol className={styles.steps}>
            {STEPS.map(({ Icon, title, text }, i) => (
              <li key={title}>
                <span className={styles.stepNum}>{i + 1}</span>
                <span className={styles.stepIcon}><Icon size={22} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="safety" className={`${styles.section} ${styles.soft}`}>
        <div className={styles.wrap}>
          <h2>Safe from the first message</h2>
          <div className={styles.grid4}>
            {SAFETY.map(({ Icon, tone, title, text }) => (
              <div key={title} className={styles.tile}>
                <span className={`${styles.tileIcon} ${tone}`}><Icon size={22} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={`${styles.wrap} ${styles.grid2}`}>
          <div className={`${styles.feature} ${styles.featureGreen}`}>
            <Tent size={28} />
            <h3>Leaving camp?</h3>
            <p>Book from camp, view by video call, and move in on your exit day.</p>
          </div>
          <div className={`${styles.feature} ${styles.featureAmber}`}>
            <BunkIcon size={28} />
            <h3>Just need a week or two?</h3>
            <p>Short stays from 1 week. Paid upfront, no deposit.</p>
          </div>
        </div>
      </section>

      <section id="hosts" className={styles.section}>
        <div className={`${styles.wrap} ${styles.hosts}`}>
          <div>
            <span className={styles.hostIcon}><HostIcon size={30} /></span>
            <h2>Got a spare room? Host a corper.</h2>
            <ul className={styles.hostList}>
              <li><Check size={18} />Verified corpers only</li>
              <li><Check size={18} />Your house rules, in a written agreement</li>
              <li><Check size={18} />Free or paid inspections, your choice</li>
              <li><Check size={18} />Paid 24 hours after move-in</li>
            </ul>
            <Link href="/host" className={styles.ctaDark}>Host a corper</Link>
          </div>
        </div>
      </section>

      <section id="faq" className={`${styles.section} ${styles.soft}`}>
        <div className={`${styles.wrap} ${styles.narrow}`}>
          <h2>Questions</h2>
          <div className={styles.faq}>
            {FAQ.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}<ChevronDown size={20} /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.band}>
        <div className={styles.wrap}>
          <h2>Find your bunkie.</h2>
          <Link href="/welcome" className={styles.ctaMain}>Find a room</Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footGrid}`}>
          <span className={styles.brand}><i><BunkMark /></i>bunkie</span>
          <nav aria-label="Footer">
            <Link href="/help">Help</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/waitlist">Other states</Link>
          </nav>
          <p>[Company name] · RC [CAC number] · Not affiliated with or endorsed by NYSC.</p>
        </div>
      </footer>
    </div>
  );
}
