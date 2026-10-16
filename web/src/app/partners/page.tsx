import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowIcon, BankIcon, CalendarIcon, CameraIcon, CheckIcon, ChevronDownIcon, DocIcon, HomeIcon, KeyIcon,
  LockIcon, PauseIcon, PinIcon, ProfileIcon, ShieldIcon, SparkIcon, VerifiedIcon, VideoIcon, WalletIcon,
} from "@/components/icons";
import { LandingFooter, LandingNav } from "@/components/LandingChrome";
import base from "../landing.module.css";
import styles from "./partners.module.css";

export const metadata: Metadata = {
  title: "Host partners",
  description: "Partner with Bunkie. Host verified corp members in Abuja and keep 98% of your rent.",
  openGraph: { title: "Become a Bunkie host partner", description: "Host verified corp members in Abuja.", type: "website" },
};

const WHY = [
  { Icon: VerifiedIcon, tone: styles.whyGreen, title: "Corpers you can trust", text: "Every corper is verified with their ID, a selfie and their call-up letter." },
  { Icon: WalletIcon, tone: styles.whyAmber, title: "Rent that arrives", text: "Corpers pay in the app. You’re paid after move-in and keep 98%." },
  { Icon: DocIcon, tone: styles.whyInk, title: "Your house, your rules", text: "Set your rules and who you host. Both of you agree to them in writing." },
];

const DEAL = {
  you: ["A clean, safe room, as listed", "Honest photos, taken in the app", "Quick replies to requests", "Keeping to the agreement"],
  us: ["Verifying every corper", "Holding rent until move-in", "Keeping your number private", "A team that steps in on reports and deposits"],
};

const STEPS = [
  { Icon: ProfileIcon, title: "Sign up", text: "With email or Google." },
  { Icon: ShieldIcon, title: "Verify your ID", text: "Your NIN and a selfie." },
  { Icon: CameraIcon, title: "List your room", text: "Photos in the app, price and house rules." },
  { Icon: KeyIcon, title: "Go live", text: "We review every room before it’s live." },
];

const NEEDS = [
  { Icon: PinIcon, text: "A room in Abuja" },
  { Icon: VerifiedIcon, text: "Your NIN" },
  { Icon: CameraIcon, text: "A phone with a camera" },
  { Icon: BankIcon, text: "A Nigerian bank account" },
];

const WAYS = [
  { Icon: CalendarIcon, tone: base.tMint, title: "Long stays", text: "1 to 12 months, paid in the app." },
  { Icon: HomeIcon, tone: base.tAmber, title: "Short stays", text: "1 to 4 weeks, if you opt in. Paid upfront." },
  { Icon: VideoIcon, tone: base.tSky, title: "Viewings", text: "Video calls, or inspections that are free or up to ₦5,000." },
  { Icon: PauseIcon, tone: base.tLilac, title: "Pause any time", text: "Take your room off search and back on." },
];

const FAQ = [
  { q: "Do I have to be a corper to host?", a: "No. Anyone with a room in Abuja can host. Serving and ex-corpers get a Corper host badge." },
  { q: "How much does Bunkie take?", a: "2% of each payment. Listing your room is free." },
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
            <h1>Turn your spare room into steady rent.</h1>
            <p className={styles.lede}>Partner with Bunkie and host verified corp members in Abuja.</p>
            <div className={styles.ctas}>
              <Link href="/host" className={styles.ctaMain}>Become a host partner</Link>
              <a href="#start" className={styles.ctaGhost}>How it works</a>
            </div>
            <ul className={styles.ticks}>
              <li><CheckIcon size={16} />Free to list</li>
              <li><CheckIcon size={16} />Keep 98%</li>
              <li><CheckIcon size={16} />Verified corpers</li>
            </ul>
          </div>

          <div className={styles.stack} aria-hidden="true">
            <div className={`${styles.card} ${styles.request}`}>
              <span className={styles.avatar}>T</span>
              <div>
                <b>Tolu wants your room</b>
                <span><VerifiedIcon size={13} />Verified corper · 6 months</span>
              </div>
            </div>
            <div className={`${styles.card} ${styles.room}`}>
              <div className={styles.roomImg} style={{ backgroundImage: "url(/demo/room-1.svg)" }}>
                <span className={styles.live}>Live</span>
              </div>
              <div className={styles.roomRow}><b>₦72,000<small> /month</small></b><span>Utako</span></div>
            </div>
            <div className={`${styles.card} ${styles.payout}`}>
              <WalletIcon size={20} />
              <b>₦70,560</b>
              <span>Paid out after move-in</span>
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
          <h2>You give a corper a soft landing.<br /><span>We handle the rest.</span></h2>
          <p>Verification, payments, the agreement and chat, in one app.</p>
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
            <span className={styles.corperTag}><SparkIcon size={14} />Corper host</span>
            <h2>Served or serving?<br />Get the Corper host badge.</h2>
            <p>Add your call-up letter or discharge certificate. Corper hosts come up top in search.</p>
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
          <h2>Ready to host a corper?</h2>
          <Link href="/host" className={base.ctaWhite}>Become a host partner <ArrowIcon size={18} /></Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
