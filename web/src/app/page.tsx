import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowIcon, BunkIcon, CampIcon, ChatIcon, CheckIcon, ChevronDownIcon, HomeIcon, HostIcon,
  KeyIcon, LockIcon, PinIcon, SearchIcon, ShieldIcon, SparkIcon, VerifiedIcon, VideoIcon, WalletIcon,
} from "@/components/icons";
import { LandingFooter, LandingNav } from "@/components/LandingChrome";
import { RotatingWord } from "@/components/RotatingWord";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: { absolute: "Bunkie · Leave NYSC camp with your bunkie" },
  description: "Start your service year with a friend. Bunkie pairs new corp members with corpers already serving in Abuja.",
  openGraph: {
    title: "Bunkie · Leave NYSC camp with your bunkie",
    description: "Start your service year with a friend, not alone.",
    type: "website",
  },
};

const WORDS = ["your bunkie.", "a friend.", "a head start.", "a place to stay."];

const WORRIES = [
  { q: "“I don’t know anyone in Abuja.”", Icon: BunkIcon, a: "You’ll know your bunkie. And your bunkie knows the city." },
  { q: "“Where do I even start after camp?”", Icon: KeyIcon, a: "With your bunkie. Move in on exit day and settle in at your pace." },
  { q: "“Can I see the place from camp?”", Icon: VideoIcon, a: "Yes. Video call your bunkie before you leave camp." },
  { q: "“Will I be safe?”", Icon: ShieldIcon, a: "Every bunkie is verified. Choose women only, men only or mixed." },
];

const YEAR = [
  { Icon: CampIcon, when: "In camp", text: "Meet your bunkie on a video call." },
  { Icon: KeyIcon, when: "Exit day", text: "Move in with someone who knows the way." },
  { Icon: PinIcon, when: "First weeks", text: "Settle in at your own pace." },
  { Icon: HomeIcon, when: "When you’re ready", text: "Stay on, or find your own place." },
  { Icon: SparkIcon, when: "Next batch", text: "Be someone’s bunkie." },
];

const SAFETY = [
  { Icon: VerifiedIcon, tone: styles.tMint, title: "Verified bunkies", text: "Every host and every room is checked before going live." },
  { Icon: WalletIcon, tone: styles.tAmber, title: "Pay only in Bunkie", text: "Your money is held until you move in." },
  { Icon: LockIcon, tone: styles.tSky, title: "Numbers private", text: "Phone numbers stay hidden until you book." },
  { Icon: BunkIcon, tone: styles.tLilac, title: "Your choice of home", text: "Women only, men only or mixed." },
];

const FAQ = [
  { q: "Will I stay with a corper?", a: "Corper hosts come first and wear a badge. Other hosts in Abuja are there too." },
  { q: "How long can I stay?", a: "From one week to the rest of your service year. Stay until you’re settled." },
  { q: "Can I book while I’m still in camp?", a: "Yes. Meet your bunkie by video call and move in on your camp exit day." },
  { q: "How do I pay?", a: "Only inside Bunkie, by card, transfer or USSD through Paystack. Never to a personal account." },
  { q: "Is Bunkie only in Abuja?", a: <>For now, yes. <Link href="/waitlist">Join the waitlist</Link> for your state.</> },
];

/** Pinterest-style collage: four columns of moments from a first service year, drifting slowly. */
function Collage() {
  const person = (img: string, badge: React.ReactNode, name: string, sub: string, tall = false) => (
    <div className={styles.pin}>
      <div className={`${styles.pinImg} ${tall ? styles.tall : ""}`} style={{ backgroundImage: `url(${img})` }}>{badge}</div>
      <div className={styles.pinRow}><b>{name}</b></div>
      <span className={styles.pinSub}>{sub}</span>
    </div>
  );
  const corper = <span className={styles.badgeAmber}><SparkIcon size={11} />Corper host</span>;
  const cols = [
    [
      person("/demo/room-1.svg", corper, "Amaka", "Serving · Utako", true),
      <div key="chat" className={`${styles.pin} ${styles.chat}`}>
        <span className={styles.bubbleMe}>Just got my posting. Garki!</span>
        <span className={styles.bubbleThem}>Welcome! That’s close to mine.</span>
      </div>,
    ],
    [
      <div key="id" className={`${styles.pin} ${styles.person}`}>
        <span className={styles.avatar}>A</span>
        <b>Meet Amaka</b>
        <span className={styles.personTag}><SparkIcon size={13} />Your bunkie</span>
      </div>,
      person("/demo/room-3.svg", <span className={styles.badgeWhite}><VerifiedIcon size={11} />Verified</span>, "Tunde", "Served · Jabi"),
      <div key="exit" className={`${styles.pin} ${styles.stat} ${styles.statGreen}`}><KeyIcon size={20} /><b>Exit day</b><span>Move in with your bunkie</span></div>,
    ],
    [
      <div key="week" className={`${styles.pin} ${styles.stat} ${styles.statAmber}`}><HomeIcon size={20} /><b>Week one</b><span>Settling in</span></div>,
      person("/demo/room-2.svg", <span className={styles.badgeWhite}><VideoIcon size={11} />Video call from camp</span>, "Ngozi", "Serving · Wuse 2", true),
    ],
    [
      person("/demo/room-4.svg", corper, "Ifeanyi", "Serving · Gwarinpa"),
      <div key="ok" className={`${styles.pin} ${styles.note}`}>
        <span className={styles.dotGreen}><ChatIcon size={14} /></span>Amaka accepted your request
      </div>,
      <div key="next" className={`${styles.pin} ${styles.stat} ${styles.statInk}`}><SparkIcon size={20} /><b>Next batch</b><span>Be someone’s bunkie</span></div>,
    ],
  ];
  return (
    <div className={styles.collage} aria-hidden="true">
      {cols.map((c, i) => (
        <div key={i} className={styles.col}>
          {c.map((el, j) => <div key={j}>{el}</div>)}
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  return (
    <div className={styles.page} data-full>
      <LandingNav
        links={[{ href: "#year", label: "How it works" }, { href: "#safety", label: "Safety" }, { href: "/partners", label: "Host partners" }]}
        cta={{ href: "/welcome", label: "Find your bunkie" }}
      />

      <section className={styles.hero}>
        <div className={styles.wrap}>
          <span className={styles.eyebrow}><CampIcon size={15} />For corp members in Abuja</span>
          <h1 aria-label="Leave NYSC camp with your bunkie.">
            Leave NYSC camp with <RotatingWord words={WORDS} className={styles.rotate} />
          </h1>
          <p className={styles.lede}>Your bunkie is a corper who’s already serving in Abuja. Someone in your corner from day one.</p>

          <Link href="/welcome" className={styles.search}>
            <span className={styles.searchText}>
              <b>Find your bunkie</b>
              <span>Where’s your PPA? Garki, Wuse, Utako…</span>
            </span>
            <span className={styles.searchBtn} aria-hidden="true"><SearchIcon size={20} /></span>
          </Link>
          <Link href="/partners" className={styles.heroHost}>Already serving? Be someone’s bunkie <ArrowIcon size={16} /></Link>
        </div>
        <Collage />
      </section>

      <section className={styles.statement}>
        <div className={styles.wrap}>
          <h2>A room gives you a bed.<br /><span>A bunkie gives you a start.</span></h2>
          <p>Someone to ask about the city, your PPA and everything in between. Someone who’s been exactly where you are.</p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.wrap}>
          <h2 className={styles.center}>Sound familiar?</h2>
          <div className={styles.worries}>
            {WORRIES.map(({ q, a, Icon }) => (
              <div key={q} className={styles.worry}>
                <p className={styles.quote}>{q}</p>
                <p className={styles.answer}><span><Icon size={20} /></span>{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="year" className={`${styles.section} ${styles.soft}`}>
        <div className={styles.wrap}>
          <h2>From camp to settled.</h2>
          <ol className={styles.year}>
            {YEAR.map(({ Icon, when, text }) => (
              <li key={when}>
                <span className={styles.yearIcon}><Icon size={28} /></span>
                <h3>{when}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.section}>
        <div className={`${styles.wrap} ${styles.split}`}>
          <div className={`${styles.feature} ${styles.featureGreen}`}>
            <span className={styles.featureTag}><BunkIcon size={14} />Your bunkie</span>
            <h3>Not alone, from day one.</h3>
            <p>Your bunkie has done camp, posting and their first weeks in Abuja. Now you start yours together.</p>
          </div>
          <div className={`${styles.feature} ${styles.featureAmber}`}>
            <span className={styles.featureTag}><HomeIcon size={14} />Your pace</span>
            <h3>Stay as long as you need.</h3>
            <p>A week, a few months or the whole year. Move on when you’re settled.</p>
          </div>
        </div>
      </section>

      <section id="safety" className={`${styles.section} ${styles.soft}`}>
        <div className={styles.wrap}>
          <h2>Safe from the first message.</h2>
          <div className={styles.grid4}>
            {SAFETY.map(({ Icon, tone, title, text }) => (
              <div key={title} className={styles.tile}>
                <span className={`${styles.tileIcon} ${tone}`}><Icon size={26} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.flushBottom}`}>
        <div className={styles.wrap}>
          <div className={styles.legacy}>
            <span className={styles.legacyYear} aria-hidden="true">1973</span>
            <div>
              <h2>Corpers looking out for corpers.</h2>
              <p>NYSC began in 1973 to build common ties among young Nigerians. Every batch, corpers land in a new state, often far from home. Bunkie keeps that spirit going, one corper welcoming the next.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="hosts" className={styles.section}>
        <div className={`${styles.wrap} ${styles.hosts}`}>
          <div>
            <span className={styles.hostIcon}><HostIcon size={30} /></span>
            <span className={styles.hostKicker}>Bunkie host partners</span>
            <h2>Already settled in?<br />Be someone’s bunkie.</h2>
            <ul className={styles.hostList}>
              <li><CheckIcon size={18} />Give a new corper a soft landing</li>
              <li><CheckIcon size={18} />Host a fellow corper</li>
              <li><CheckIcon size={18} />Your house rules, in writing</li>
              <li><CheckIcon size={18} />Rent paid in the app</li>
            </ul>
            <div className={styles.hostCtas}>
              <Link href="/partners" className={styles.ctaGreen}>Become a host partner</Link>
              <Link href="/partners" className={styles.ctaLine}>See what it involves <ArrowIcon size={16} /></Link>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className={styles.section}>
        <div className={`${styles.wrap} ${styles.narrow}`}>
          <h2>Questions</h2>
          <div className={styles.faq}>
            {FAQ.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}<ChevronDownIcon size={20} /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.band}>
        <div className={styles.wrap}>
          <h2>Start your service year <span className={styles.bandAccent}>with a friend.</span></h2>
          <Link href="/welcome" className={styles.ctaWhite}>Find your bunkie</Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
