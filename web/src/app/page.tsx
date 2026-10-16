import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowIcon, BunkIcon, CalendarIcon, CampIcon, ChatIcon, CheckIcon, ChevronDownIcon, ClockIcon, HomeIcon, HostIcon,
  KeyIcon, LockIcon, PinIcon, SearchIcon, ShieldIcon, SparkIcon, VerifiedIcon, VideoIcon, WalletIcon,
} from "@/components/icons";
import { LandingFooter, LandingNav } from "@/components/LandingChrome";
import { RotatingWord } from "@/components/RotatingWord";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: { absolute: "Bunkie · Leave camp with a place to stay" },
  description: "Verified rooms for corp members in Abuja. Book from camp, pay monthly, move in on exit day.",
  openGraph: {
    title: "Bunkie · Leave camp with a place to stay",
    description: "Verified rooms for corp members in Abuja.",
    type: "website",
  },
};

const WORDS = ["a place to stay.", "your bunkie.", "a soft landing.", "peace of mind."];

const WORRIES = [
  { q: "“The agent wants one year upfront, plus agency and legal.”", Icon: CalendarIcon, a: "Pay monthly. Stay 1 week to 12 months. No agency fee." },
  { q: "“How do I see the room from camp?”", Icon: VideoIcon, a: "Video call the host from camp. Move in on exit day." },
  { q: "“What if it’s a scam?”", Icon: ShieldIcon, a: "Every host is verified. Your money is held until you move in." },
  { q: "“Who will I be living with?”", Icon: BunkIcon, a: "Meet your bunkie first. Choose women only, men only or mixed." },
];

const YEAR = [
  { Icon: CampIcon, when: "In camp", text: "Browse rooms. Video call hosts." },
  { Icon: PinIcon, when: "Posting day", text: "Add your PPA. See rooms by commute." },
  { Icon: KeyIcon, when: "Exit day", text: "Move in." },
  { Icon: WalletIcon, when: "Every month", text: "Pay rent in the app." },
  { Icon: HomeIcon, when: "Passing out", text: "Move out. Deposit settled in the app." },
];

const SAFETY = [
  { Icon: VerifiedIcon, tone: styles.tMint, title: "Verified hosts", text: "ID and selfie checks. Every room is reviewed before it goes live." },
  { Icon: WalletIcon, tone: styles.tAmber, title: "Money held", text: "Paid through Paystack. Released after you move in." },
  { Icon: LockIcon, tone: styles.tSky, title: "Numbers private", text: "Phone numbers and account details stay hidden until you pay." },
  { Icon: SparkIcon, tone: styles.tLilac, title: "Corper hosts", text: "Hosts who are serving or have served get a badge." },
];

const FAQ = [
  { q: "Is Bunkie only in Abuja?", a: <>For now, yes. <Link href="/waitlist">Join the waitlist</Link> for your state.</> },
  { q: "Can I book while I’m still in camp?", a: "Yes. View the room by video call and move in on your camp exit day." },
  { q: "How do I pay?", a: "Only inside Bunkie, by card, transfer or USSD through Paystack. Never to a personal account." },
  { q: "When does the host get paid?", a: "After you move in, if nothing is wrong." },
  { q: "What’s an inspection fee?", a: "Some hosts charge up to ₦5,000 to inspect in person. Bunkie holds it, refunds it if the host cancels, and takes it off your rent if you book." },
  { q: "What does it cost to use?", a: "Searching, chatting and requesting are free. Paystack’s charge is added when you pay." },
];

/** Pinterest-style collage: four columns of app moments that drift slowly. */
function Collage() {
  const room = (img: string, badge: React.ReactNode, price: string, sub: string, tall = false) => (
    <div className={styles.pin}>
      <div className={`${styles.pinImg} ${tall ? styles.tall : ""}`} style={{ backgroundImage: `url(${img})` }}>{badge}</div>
      <div className={styles.pinRow}><b>{price}<small> /month</small></b></div>
      <span className={styles.pinSub}>{sub}</span>
    </div>
  );
  const cols = [
    [
      room("/demo/room-1.svg", <span className={styles.badgeAmber}><SparkIcon size={11} />Corper host</span>, "₦72,000", "Self contain · Utako", true),
      <div key="chat" className={`${styles.pin} ${styles.chat}`}>
        <span className={styles.bubbleMe}>I’m in camp till Friday. Can we video call?</span>
        <span className={styles.bubbleThem}>Sure. 4pm?</span>
      </div>,
    ],
    [
      <div key="id" className={`${styles.pin} ${styles.person}`}>
        <span className={styles.avatar}>A</span>
        <b>Amaka</b>
        <span className={styles.personTag}><VerifiedIcon size={13} />Ex-corper host</span>
      </div>,
      room("/demo/room-3.svg", <span className={styles.badgeWhite}><VerifiedIcon size={11} />Verified</span>, "₦65,000", "Shared room · Jabi"),
      <div key="mins" className={`${styles.pin} ${styles.stat} ${styles.statGreen}`}><ClockIcon size={20} /><b>8 min</b><span>to your PPA</span></div>,
    ],
    [
      <div key="held" className={`${styles.pin} ${styles.stat} ${styles.statAmber}`}><WalletIcon size={20} /><b>Held</b><span>until you move in</span></div>,
      room("/demo/room-2.svg", <span className={styles.badgeWhite}><VideoIcon size={11} />Video viewing</span>, "₦80,000", "Self contain · Wuse 2", true),
    ],
    [
      room("/demo/room-4.svg", <span className={styles.badgeAmber}><SparkIcon size={11} />Corper host</span>, "₦55,000", "Shared room · Gwarinpa"),
      <div key="ok" className={`${styles.pin} ${styles.note}`}>
        <span className={styles.dotGreen}><ChatIcon size={14} /></span>Tolu accepted your request
      </div>,
      <div key="move" className={`${styles.pin} ${styles.stat} ${styles.statInk}`}><KeyIcon size={20} /><b>Exit day</b><span>Move in</span></div>,
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
        cta={{ href: "/welcome", label: "Find a room" }}
      />

      <section className={styles.hero}>
        <div className={styles.wrap}>
          <span className={styles.eyebrow}><CampIcon size={15} />For corp members in Abuja</span>
          <h1 aria-label="Leave camp with a place to stay.">
            Leave camp with <RotatingWord words={WORDS} className={styles.rotate} />
          </h1>
          <p className={styles.lede}>Verified rooms near your PPA. Book from camp. Pay monthly.</p>

          <Link href="/welcome" className={styles.search}>
            <span className={styles.searchText}>
              <b>Where’s your PPA?</b>
              <span>Garki, Wuse, Utako, Jabi…</span>
            </span>
            <span className={styles.searchBtn} aria-hidden="true"><SearchIcon size={20} /></span>
          </Link>
          <Link href="/partners" className={styles.heroHost}>Got a spare room? Become a host partner <ArrowIcon size={16} /></Link>
        </div>
        <Collage />
      </section>

      <section className={styles.statement}>
        <div className={styles.wrap}>
          <h2>Abuja rent is yearly.<br /><span>Your service year isn’t.</span></h2>
          <p>Rooms by the week or the month, from people who get it.</p>
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
          <h2>Built around your service year.</h2>
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
            <span className={styles.featureTag}><SparkIcon size={14} />Corper host</span>
            <h3>Bunk with someone who’s been there.</h3>
            <p>Hosts who are serving or have served know camp, PPA and allawee. They come up top.</p>
          </div>
          <div className={`${styles.feature} ${styles.featureAmber}`}>
            <span className={styles.featureTag}><CalendarIcon size={14} />Short stays</span>
            <h3>Just need a week or two?</h3>
            <p>Stay 1 to 4 weeks while you find your feet. Paid upfront, no deposit.</p>
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

      <section id="hosts" className={styles.section}>
        <div className={`${styles.wrap} ${styles.hosts}`}>
          <div>
            <span className={styles.hostIcon}><HostIcon size={30} /></span>
            <span className={styles.hostKicker}>Bunkie host partners</span>
            <h2>Got a spare room?<br />Partner with Bunkie.</h2>
            <ul className={styles.hostList}>
              <li><CheckIcon size={18} />Verified corpers only</li>
              <li><CheckIcon size={18} />Your house rules, in writing</li>
              <li><CheckIcon size={18} />Keep 98% of your rent</li>
              <li><CheckIcon size={18} />Paid after move-in</li>
            </ul>
            <div className={styles.hostCtas}>
              <Link href="/host" className={styles.ctaGreen}>Become a host partner</Link>
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
          <h2>Camp ends soon.<br />Find your bunkie.</h2>
          <Link href="/welcome" className={styles.ctaWhite}>Find a room</Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
