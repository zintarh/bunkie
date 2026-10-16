import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowIcon, BankIcon, BunkIcon, CalendarIcon, CameraIcon, CheckIcon, ChevronDownIcon, DocIcon, HomeIcon, KeyIcon,
  LockIcon, PauseIcon, PinIcon, ProfileIcon, ShieldIcon, SparkIcon, VideoIcon, WalletIcon,
} from "@/components/icons";
import { LandingFooter, LandingNav } from "@/components/LandingChrome";
import base from "../landing.module.css";
import styles from "./partners.module.css";

export const metadata: Metadata = {
  title: "Host partners",
  description: "Already settled in Abuja? Give a new corp member a soft landing. Become a Bunkie host partner.",
  openGraph: { title: "Become a Bunkie host partner", description: "Give the next batch a soft landing.", type: "website" },
};

const WHY = [
  { Icon: SparkIcon, tone: styles.whyGreen, title: "Be the welcome you’d want", text: "You’re not just renting out a room. You’re giving a new corper a friend in Abuja." },
  { Icon: BunkIcon, tone: styles.whyAmber, title: "Someone like you", text: "Your bunkie is a fellow corper, a few months behind you." },
  { Icon: WalletIcon, tone: styles.whyInk, title: "Share your rent", text: "Your bunkie pays their share in the app. No chasing, no cash." },
];

const DEAL = {
  you: ["A friendly face for their first weeks", "A welcoming, safe space, as listed", "Honest photos, taken in the app", "Keeping to the agreement"],
  us: ["Corpers who fit your home", "Holding rent until move-in", "Keeping your number private", "A team that steps in on reports and deposits"],
};

const STEPS = [
  { Icon: ProfileIcon, title: "Sign up", text: "With email or Google." },
  { Icon: ShieldIcon, title: "Get verified", text: "Quick, and kept private." },
  { Icon: CameraIcon, title: "List your space", text: "Photos in the app, price and house rules." },
  { Icon: KeyIcon, title: "Go live", text: "We review every room before it’s live." },
];

const NEEDS = [
  { Icon: PinIcon, text: "A room in Abuja" },
  { Icon: CameraIcon, text: "A phone with a camera" },
  { Icon: HomeIcon, text: "A warm welcome" },
  { Icon: BankIcon, text: "A Nigerian bank account" },
];

const WAYS = [
  { Icon: DocIcon, tone: base.tMint, title: "Your house rules", text: "Set them once. Your bunkie agrees in writing." },
  { Icon: CalendarIcon, tone: base.tAmber, title: "Any length", text: "A few weeks, if you opt in, up to 12 months." },
  { Icon: VideoIcon, tone: base.tSky, title: "Viewings", text: "Video calls, or inspections that are free or up to ₦5,000." },
  { Icon: PauseIcon, tone: base.tLilac, title: "Pause any time", text: "Take your room off search and back on." },
];

const FAQ = [
  { q: "I’m still serving. Can I host?", a: "Yes. Bunkie is built around serving corpers hosting the next batch. You’ll wear a Corper host badge." },
  { q: "Do I have to be a corper to host?", a: "No. Anyone with a room in Abuja can host. Corper hosts wear a badge and get a boost in search." },
  { q: "When do I get paid?", a: "After the corper moves in, then for each week or month of the stay." },
  { q: "What about the deposit?", a: "Bunkie holds it until move-out. You can propose deductions. If you can’t agree, the Bunkie team decides." },
  { q: "Can I charge for inspections?", a: "Yes, up to ₦5,000, or keep them free. You keep the fee if the corper doesn’t show up." },
  { q: "What if a corper leaves early?", a: "You keep the rent already paid out to you. Later weeks or months are refunded to the corper." },
  { q: "Who sees my address?", a: "Corpers see your area on the room page. The exact location is shared once a viewing is booked." },
];

export default function Partners() {
  return (
    <div className={base.page} data-full>
      <LandingNav
        links={[{ href: "#why", label: "Why host" }, { href: "#start", label: "Get started" }, { href: "#faq", label: "FAQ" }]}
        cta={{ href: "/host", label: "Become a host" }}
      />

      <section className={styles.hero}>
        <div className={`${base.wrap} ${styles.heroGrid}`}>
          <div className={styles.heroText}>
            <span className={base.eyebrow}><SparkIcon size={15} />Bunkie host partners</span>
            <h1>Give the next batch a soft landing.</h1>
            <p className={styles.lede}>You’ve found your feet in Abuja. Share your space with a new corper while they find theirs.</p>
            <div className={styles.ctas}>
              <Link href="/host" className={styles.ctaMain}>Become a host partner</Link>
              <a href="#start" className={styles.ctaGhost}>How it works</a>
            </div>
            <ul className={styles.ticks}>
              <li><CheckIcon size={16} />Fellow corpers</li>
              <li><CheckIcon size={16} />Your house rules</li>
              <li><CheckIcon size={16} />Rent paid in the app</li>
            </ul>
          </div>

          <div className={styles.stack} aria-hidden="true">
            <div className={`${styles.card} ${styles.request}`}>
              <span className={styles.avatar}>T</span>
              <div>
                <b>Tolu wants to bunk with you</b>
                <span><SparkIcon size={13} />Corper · just out of camp</span>
              </div>
            </div>
            <div className={`${styles.card} ${styles.room}`}>
              <div className={styles.roomImg} style={{ backgroundImage: "url(/demo/room-1.svg)" }}>
                <span className={styles.live}><SparkIcon size={12} />Corper host</span>
              </div>
              <div className={styles.roomRow}><b>Your place</b><span>Utako</span></div>
            </div>
            <div className={`${styles.card} ${styles.payout}`}>
              <KeyIcon size={20} />
              <b>Exit day</b>
              <span>Tolu moves in</span>
            </div>
            <div className={`${styles.card} ${styles.signed}`}>
              <span className={styles.dot}><DocIcon size={15} /></span>House rules agreed
            </div>
          </div>
        </div>
      </section>

      <section id="why" className={base.section}>
        <div className={base.wrap}>
          <h2>Why partner with Bunkie?</h2>
          <div className={styles.why}>
            {WHY.map(({ Icon, tone, title, text }) => (
              <div key={title} className={`${styles.whyCard} ${tone}`}>
                <span className={styles.whyIcon}><Icon size={26} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={base.statement}>
        <div className={base.wrap}>
          <h2>You’ve found your feet.<br /><span>Help someone find theirs.</span></h2>
          <p>It’s the spirit NYSC started with: common ties, one batch to the next. Bunkie handles payments and the agreement, so you can focus on being a good bunkie.</p>
        </div>
      </section>

      <section className={base.section}>
        <div className={base.wrap}>
          <h2 className={base.center}>A real partnership.</h2>
          <div className={styles.deal}>
            <div className={styles.dealCol}>
              <span className={styles.dealHead}><HomeIcon size={22} />You bring</span>
              <ul>{DEAL.you.map((t) => <li key={t}><CheckIcon size={18} />{t}</li>)}</ul>
            </div>
            <div className={`${styles.dealCol} ${styles.dealUs}`}>
              <span className={styles.dealHead}><LockIcon size={22} />Bunkie brings</span>
              <ul>{DEAL.us.map((t) => <li key={t}><CheckIcon size={18} />{t}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      <section id="start" className={`${base.section} ${base.soft}`}>
        <div className={base.wrap}>
          <h2>Get started.</h2>
          <ol className={styles.steps}>
            {STEPS.map(({ Icon, title, text }, i) => (
              <li key={title}>
                <span className={styles.stepNum}>{i + 1}</span>
                <span className={styles.stepIcon}><Icon size={24} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <div className={styles.needs}>
            <h3>What you’ll need</h3>
            <ul>
              {NEEDS.map(({ Icon, text }) => <li key={text}><span><Icon size={20} /></span>{text}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className={base.section}>
        <div className={base.wrap}>
          <div className={styles.corper}>
            <span className={styles.corperTag}><HomeIcon size={14} />Everyone’s welcome</span>
            <h2>Not a corper?<br />You’re welcome too.</h2>
            <p>Anyone with a room in Abuja can host. Corper hosts wear a badge and get a boost in search.</p>
          </div>
        </div>
      </section>

      <section className={`${base.section} ${base.soft}`}>
        <div className={base.wrap}>
          <h2>Host your way.</h2>
          <div className={base.grid4}>
            {WAYS.map(({ Icon, tone, title, text }) => (
              <div key={title} className={base.tile}>
                <span className={`${base.tileIcon} ${tone}`}><Icon size={26} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className={base.section}>
        <div className={`${base.wrap} ${base.narrow}`}>
          <h2>Questions from hosts</h2>
          <div className={base.faq}>
            {FAQ.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}<ChevronDownIcon size={20} /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={base.band}>
        <div className={base.wrap}>
          <h2>Ready to be someone’s bunkie?</h2>
          <Link href="/host" className={base.ctaWhite}>Become a host partner <ArrowIcon size={18} /></Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
