"use client";
import { useEffect, useRef, useState } from "react";
import s from "./story.module.css";

// Bunkie's story in five scenes (20s loop), drawn and animated in code: sharp on every screen,
// a few KB instead of a video download, and the captions are real text. Plays only while on screen;
// with reduced motion it rests on the last scene.

const SKIN = { a: "#7A4A2E", b: "#5B3520" };
const KHAKI = "#C9AE7C";

/** A person, flat and friendly. (x, y) is the centre of the head. */
function Person({ x, y, skin, top, hair, cap, wave, scale = 1, className }: {
  x: number; y: number; skin: string; top: string; hair: "puff" | "short" | "bun"; cap?: boolean; wave?: boolean; scale?: number; className?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className={className}>
        <path d="M-40 92 C-40 46 -24 34 0 34 C24 34 40 46 40 92 Z" fill={top} />
        {wave && (
          <g className={s.wave}>
            <path d="M30 52 L52 8" stroke={top} strokeWidth="13" strokeLinecap="round" />
            <circle cx="53" cy="4" r="8" fill={skin} />
          </g>
        )}
        {hair === "puff" && <><circle cx="0" cy="-14" r="24" fill="#1E120B" /><circle cx="0" cy="-36" r="11" fill="#1E120B" /></>}
        <rect x="-8" y="16" width="16" height="22" rx="6" fill={skin} />
        <circle cx="0" cy="0" r="24" fill={skin} />
        {hair === "bun" && <circle cx="14" cy="-30" r="12" fill="#1E120B" />}
        {hair === "bun" && <path d="M-26 6 C-30 -26 -14 -32 0 -32 C14 -32 30 -26 26 6 C22 -10 14 -16 0 -16 C-14 -16 -22 -10 -26 6 Z" fill="#1E120B" />}
        {hair === "short" && <path d="M-24 -4 C-24 -26 -12 -30 0 -30 C12 -30 24 -26 24 -4 C18 -16 -18 -16 -24 -4 Z" fill="#1E120B" />}
        {cap && <><path d="M-25 -8 C-25 -30 25 -30 25 -8 Z" fill={KHAKI} /><rect x="-30" y="-11" width="44" height="6" rx="3" fill="#B0925E" /></>}
        <circle cx="-8" cy="2" r="2.6" fill="#1E120B" />
        <circle cx="8" cy="2" r="2.6" fill="#1E120B" />
        <path d="M-7 11 Q0 17 7 11" stroke="#1E120B" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

/** Bunkie's bunk: two posts, two beds, pillows. */
function Bunk({ x, y, w = 150, a = "#17A862", b = "#F5B83D" }: { x: number; y: number; w?: number; a?: string; b?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2 - 6} y="0" width="10" height="190" rx="5" fill="#10231B" />
      <rect x={w / 2 - 4} y="0" width="10" height="190" rx="5" fill="#10231B" />
      <rect x={-w / 2} y="60" width={w} height="20" rx="8" fill={a} />
      <rect x={-w / 2} y="150" width={w} height="20" rx="8" fill={b} />
      <ellipse cx={-w / 2 + 26} cy="54" rx="20" ry="9" fill="#fff" />
      <ellipse cx={-w / 2 + 26} cy="144" rx="20" ry="9" fill="#fff" />
    </g>
  );
}

const CAPTIONS = [
  "Day 21. Camp ends tomorrow.",
  "Posted to Abuja. Knows no one.",
  "Meets her bunkie on a video call, from camp.",
  "Exit day: moves in with someone who knows the way.",
  "Leave camp with your bunkie.",
];

export function StoryReel() {
  const ref = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPlay(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={s.reel} data-play={play || undefined} role="img" aria-label={`Bunkie's story: ${CAPTIONS.join(" ")}`}>
      <div className={s.stage}>
        <svg viewBox="0 0 800 500" aria-hidden="true">
          {/* 1. Camp */}
          <g className={`${s.scene} ${s.s1}`}>
            <rect width="800" height="500" fill="#FFF6E3" />
            <rect y="410" width="800" height="90" fill="#F1E2C0" />
            <Bunk x={150} y={220} />
            <Bunk x={650} y={220} a="#F5B83D" b="#17A862" />
            <Person x={400} y={294} skin={SKIN.a} top={KHAKI} hair="puff" cap scale={1.25} className={s.bob} />
            <g className={s.cal}>
              <rect x="330" y="50" width="140" height="150" rx="22" fill="#fff" stroke="#10231B" strokeWidth="4" />
              <rect x="330" y="50" width="140" height="44" rx="22" fill="#17A862" />
              <rect x="330" y="72" width="140" height="22" fill="#17A862" />
              <text x="400" y="82" textAnchor="middle" className={s.calHead}>DAY</text>
              <text x="400" y="172" textAnchor="middle" className={`${s.calNum} ${s.n19}`}>19</text>
              <text x="400" y="172" textAnchor="middle" className={`${s.calNum} ${s.n20}`}>20</text>
              <text x="400" y="172" textAnchor="middle" className={`${s.calNum} ${s.n21}`}>21</text>
            </g>
          </g>

          {/* 2. The posting */}
          <g className={`${s.scene} ${s.s2}`}>
            <rect width="800" height="500" fill="#E4F8EC" />
            <path d="M-20 420 C40 250 210 230 290 420 Z" fill="#C3E8D2" className={s.rock} />
            <g className={s.city}>
              <rect x="440" y="250" width="70" height="170" rx="8" fill="#9ED7B6" />
              <rect x="520" y="200" width="60" height="220" rx="8" fill="#7CCB9F" />
              <rect x="590" y="280" width="80" height="140" rx="8" fill="#9ED7B6" />
              <rect x="680" y="230" width="60" height="190" rx="8" fill="#7CCB9F" />
              {[455, 535, 605, 695].map((x) => <rect key={x} x={x} y="300" width="14" height="14" rx="3" fill="#E4F8EC" />)}
            </g>
            <rect y="410" width="800" height="90" fill="#BFE6CF" />
            <g className={s.letter}>
              <g transform="rotate(-4 400 260)">
                <rect x="250" y="150" width="300" height="210" rx="18" fill="#fff" stroke="#10231B" strokeWidth="4" />
                <text x="280" y="196" className={s.letterHead}>POSTING LETTER</text>
                <rect x="280" y="214" width="170" height="9" rx="4.5" fill="#E2E8E4" />
                <rect x="280" y="232" width="120" height="9" rx="4.5" fill="#E2E8E4" />
                <text x="280" y="290" className={s.letterBig}>PPA: Utako,</text>
                <text x="280" y="326" className={s.letterBig}>Abuja</text>
                <g className={s.stamp}>
                  <circle cx="494" cy="306" r="28" fill="none" stroke="#17A862" strokeWidth="4" />
                  <path d="M481 307 l9 9 l17 -19" fill="none" stroke="#17A862" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </g>
            </g>
            <g className={s.ask}>
              <circle cx="560" cy="130" r="38" fill="#F5B83D" stroke="#10231B" strokeWidth="4" />
              <text x="560" y="148" textAnchor="middle" className={s.askMark}>?</text>
            </g>
          </g>

          {/* 3. Meet your bunkie from camp */}
          <g className={`${s.scene} ${s.s3}`}>
            <rect width="800" height="500" fill="#FFF6E3" />
            <g className={s.phone}>
              <rect x="290" y="34" width="220" height="440" rx="34" fill="#10231B" />
              <rect x="302" y="46" width="196" height="416" rx="24" fill="#DCEFFB" />
              <rect x="302" y="46" width="196" height="58" rx="24" fill="#fff" />
              <rect x="302" y="80" width="196" height="24" fill="#fff" />
              <circle cx="330" cy="76" r="14" fill="#F5B83D" />
              <text x="330" y="82" textAnchor="middle" className={s.callInitial}>L</text>
              <text x="352" y="72" className={s.callName}>Ladi</text>
              <text x="352" y="90" className={s.callSub}>Utako</text>
              <rect x="436" y="64" width="50" height="24" rx="12" fill="#E4F8EC" />
              <text x="461" y="81" textAnchor="middle" className={s.fit}>92%</text>
              <Person x={400} y={250} skin={SKIN.b} top="#17A862" hair="bun" wave scale={1.35} />
              <rect x="412" y="352" width="76" height="94" rx="16" fill="#FFF6E3" stroke="#fff" strokeWidth="4" />
              <Person x={450} y={386} skin={SKIN.a} top={KHAKI} hair="puff" cap scale={0.58} />
            </g>
            <g className={s.bubbleL}>
              <rect x="40" y="150" width="226" height="64" rx="22" fill="#fff" stroke="#10231B" strokeWidth="3" />
              <text x="62" y="190" className={s.bubbleText}>Just got Utako!</text>
            </g>
            <g className={s.bubbleR}>
              <rect x="534" y="270" width="236" height="64" rx="22" fill="#17A862" />
              <text x="556" y="310" className={`${s.bubbleText} ${s.bubbleOn}`}>Come stay with me</text>
            </g>
          </g>

          {/* 4. Exit day */}
          <g className={`${s.scene} ${s.s4}`}>
            <rect width="800" height="500" fill="#E4F8EC" />
            <circle cx="680" cy="90" r="40" fill="#F5B83D" className={s.sun} />
            <rect y="420" width="800" height="80" fill="#BFE6CF" />
            <g>
              <path d="M330 190 L520 100 L710 190 Z" fill="#17A862" stroke="#10231B" strokeWidth="4" strokeLinejoin="round" />
              <rect x="350" y="186" width="340" height="236" fill="#FDEBC4" stroke="#10231B" strokeWidth="4" />
              <rect x="590" y="236" width="70" height="60" rx="10" fill="#DCEFFB" stroke="#10231B" strokeWidth="4" />
              <rect x="440" y="270" width="96" height="152" fill="#F5B83D" stroke="#10231B" strokeWidth="4" />
              <rect x="440" y="270" width="96" height="152" fill="#0E8247" stroke="#10231B" strokeWidth="4" className={s.door} />
              <Person x={488} y={330} skin={SKIN.b} top="#17A862" hair="bun" scale={0.86} className={s.host} />
            </g>
            <g className={s.walk}>
              <Person x={250} y={340} skin={SKIN.a} top={KHAKI} hair="puff" cap scale={0.86} />
              <rect x="186" y="374" width="40" height="46" rx="10" fill="#10231B" />
              <rect x="198" y="364" width="16" height="14" rx="5" fill="none" stroke="#10231B" strokeWidth="4" />
            </g>
            <g className={s.key}>
              <circle cx="532" cy="372" r="11" fill="#F5B83D" stroke="#10231B" strokeWidth="4" />
              <path d="M543 372 H568 M560 372 V381" stroke="#10231B" strokeWidth="5" strokeLinecap="round" />
            </g>
          </g>

          {/* 5. Bunkies */}
          <g className={`${s.scene} ${s.s5}`}>
            <rect width="800" height="500" fill="#17A862" />
            <circle cx="400" cy="560" r="330" fill="#34D186" opacity="0.35" />
            <g className={s.duo}>
              <Person x={330} y={300} skin={SKIN.a} top={KHAKI} hair="puff" scale={1.1} />
              <Person x={470} y={300} skin={SKIN.b} top="#FDEBC4" hair="bun" scale={1.1} />
            </g>
            <g className={s.mark}>
              <rect x="352" y="70" width="96" height="96" rx="26" fill="#F5B83D" />
              <path d="M380 92v52M420 92v52M380 110h40M380 128h40" stroke="#10231B" strokeWidth="8" strokeLinecap="round" />
            </g>
            {[[230, 140], [580, 120], [620, 230], [180, 250]].map(([x, y], i) => (
              <path key={i} className={s.spark} style={{ animationDelay: `${i * 0.15}s` }}
                d={`M${x} ${y - 12} C${x + 2} ${y - 2} ${x + 2} ${y - 2} ${x + 12} ${y} C${x + 2} ${y + 2} ${x + 2} ${y + 2} ${x} ${y + 12} C${x - 2} ${y + 2} ${x - 2} ${y + 2} ${x - 12} ${y} C${x - 2} ${y - 2} ${x - 2} ${y - 2} ${x} ${y - 12} Z`}
                fill="#FDEBC4" />
            ))}
          </g>
        </svg>
      </div>
      <div className={s.captions}>
        {CAPTIONS.map((c, i) => <p key={c} className={`${s.caption} ${s[`c${i + 1}`]}`}>{c}</p>)}
      </div>
      <div className={s.bars} aria-hidden="true">
        {CAPTIONS.map((c, i) => <span key={c}><i className={s[`b${i + 1}`]} /></span>)}
      </div>
    </div>
  );
}
