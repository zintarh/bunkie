"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Clock, Home, ShieldCheck, Wallet } from "lucide-react";
import { BunkMark } from "@/components/ui";
import { setPrefs, usePrefs } from "@/lib/prefs";
import styles from "./intro.module.css";

const SLIDES = [
  { title: "Find your bunkie", sub: "Share a room near your PPA." },
  { title: "Every host is verified", sub: "Real people. Real rooms." },
  { title: "See it, then pay", sub: "Your money is held until you move in." },
];

export default function Intro() {
  const router = useRouter();
  const [prefs, ready] = usePrefs();
  const [i, setI] = useState(0);
  const [splash, setSplash] = useState(true);
  const startX = useRef<number | null>(null);

  // Returning visitors skip straight to rooms.
  useEffect(() => {
    if (ready && prefs.introSeen && prefs.stage) router.replace("/explore");
  }, [ready, prefs.introSeen, prefs.stage, router]);

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1200);
    return () => clearTimeout(t);
  }, []);

  const last = i === SLIDES.length - 1;
  const go = (n: number) => setI(Math.max(0, Math.min(SLIDES.length - 1, n)));
  const finish = () => setPrefs({ introSeen: true });

  return (
    <main className="screen" style={{ background: "#fff" }}>
      <div className={styles.top}>
        <span className="wordmark" style={{ gap: 8 }}>
          <i style={{ background: "var(--green)", color: "var(--amber)", borderRadius: 8 }}><BunkMark /></i>bunkie
        </span>
        {last ? <Link className="link" href="/signup">Sign up</Link> : <button className="link muted" onClick={() => go(SLIDES.length - 1)}>Skip</button>}
      </div>

      <div className={styles.viewport}
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerUp={(e) => {
          if (startX.current == null) return;
          const dx = e.clientX - startX.current;
          if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
          startX.current = null;
        }}>
        <div className={styles.track} style={{ transform: `translateX(-${i * 100}%)` }}>
          <section className={styles.slide} aria-hidden={i !== 0}>
            <div className={`${styles.art} ${styles.green}`}>
              <span className={styles.spark} style={{ left: 28, top: 30 }} />
              <span className={styles.spark} style={{ right: 34, top: 160, animationDelay: ".8s" }} />
              <span className={`${styles.fchip} ${styles.bob2}`} style={{ right: 18, top: 22 }}><Clock size={15} strokeWidth={2.6} color="#17A862" />18 min to PPA</span>
              <span className={`${styles.fchip} ${styles.bob}`} style={{ left: 16, bottom: 18 }}><BadgeCheck size={15} strokeWidth={2.6} color="#17A862" />Verified host</span>
              <div className={styles.bunk}>
                <span className={styles.postL} /><span className={styles.postR} />
                <span className={styles.rail} style={{ top: 96 }} /><span className={styles.rail} style={{ bottom: 40 }} />
                <span className={styles.mattress} style={{ top: 70 }} /><span className={styles.mattress} style={{ bottom: 50 }} />
                <span className={`${styles.face} ${styles.bob}`} style={{ left: 38, top: 18, background: "#10231B", color: "#F5B83D" }}>A</span>
                <span className={`${styles.face} ${styles.bob2}`} style={{ right: 38, bottom: 76, background: "#FCE9BE" }}>T</span>
              </div>
            </div>
            <Text {...SLIDES[0]} />
          </section>

          <section className={styles.slide} aria-hidden={i !== 1}>
            <div className={`${styles.art} ${styles.dark}`}>
              <span className={styles.spark} style={{ left: 34, top: 40 }} />
              <span className={`${styles.fchip} ${styles.bob2}`} style={{ left: 22, bottom: 44 }}><ShieldCheck size={15} strokeWidth={2.6} color="#17A862" />NIN checked</span>
              <div className={`${styles.profile} ${styles.bob}`}>
                <div className="photo" style={{ height: 110, borderRadius: 14, backgroundImage: "url(/demo/room-1.svg)" }} />
                <div className="row" style={{ gap: 10 }}>
                  <span className="avatar" style={{ width: 34, height: 34 }}>T</span>
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <span className={styles.line} style={{ width: "80%" }} /><span className={styles.line} style={{ width: "50%" }} />
                  </span>
                </div>
              </div>
              <span className={styles.seal}><BadgeCheck size={30} strokeWidth={2.4} /></span>
            </div>
            <Text {...SLIDES[1]} />
          </section>

          <section className={styles.slide} aria-hidden={i !== 2}>
            <div className={`${styles.art} ${styles.amber}`}>
              <span className={`${styles.fchip} ${styles.bob2}`} style={{ right: 22, top: 40 }}><Wallet size={15} strokeWidth={2.6} color="#17A862" />Held until move-in</span>
              <div className={`${styles.zero} ${styles.bob}`}>
                <span className="tile t-mint" style={{ width: 52, height: 52, borderRadius: 16 }}><Home size={26} strokeWidth={2.2} /></span>
                <span style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 44, lineHeight: 1 }}>₦0</span>
                <span className="lbl">until you&apos;ve seen it</span>
              </div>
            </div>
            <Text {...SLIDES[2]} />
          </section>
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={styles.dots}>
          {SLIDES.map((s, n) => (
            <button key={s.title} className={styles.dot} onClick={() => go(n)} aria-label={`Slide ${n + 1}`} aria-current={n === i}
              style={{ width: n === i ? 24 : 8, background: n === i ? "var(--green)" : "#D5DCD6" }} />
          ))}
        </div>
        {last ? (
          <div className="stack" style={{ gap: 4 }}>
            <Link className="btn" href="/start" onClick={finish}>Find my bunkie</Link>
            <Link className="link" href="/host" onClick={finish}>I have a room to share</Link>
          </div>
        ) : (
          <div className="stack" style={{ gap: 4 }}>
            <button className="btn" onClick={() => go(i + 1)}>Next</button>
            <span style={{ height: 44 }} />
          </div>
        )}
      </div>

      <button className={styles.splash} onClick={() => setSplash(false)} aria-label="Bunkie. Tap to continue"
        style={{ opacity: splash ? 1 : 0, visibility: splash ? "visible" : "hidden" }}>
        <span className={styles.logo}><BunkMark size={42} /></span>
        <span className={styles.logoText}>bunkie</span>
      </button>
    </main>
  );
}

function Text({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "center" }}>
      <h1 className="h1">{title}</h1>
      <p className="sub">{sub}</p>
    </div>
  );
}
