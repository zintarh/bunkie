"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Pencil, X } from "lucide-react";
import { RequireAuth, safeNext } from "@/components/auth";
import { Loading, Progress } from "@/components/ui";
import { QUESTIONS } from "@/lib/bunkie";
import { errorText, useMe } from "@/lib/auth";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Answers } from "@/lib/types";

const SENTENCE: Record<keyof Answers, string[]> = {
  sleep: ["Usually asleep before 10pm.", "Usually asleep between 10pm and midnight.", "Usually asleep after midnight.", "Sleep times change a lot."],
  guests: ["No overnight guests last month.", "Overnight guests 1 or 2 nights last month.", "Overnight guests most weekends.", "Overnight guests often."],
  cooking: ["Cooks 0 or 1 evenings a week.", "Cooks 2 to 4 evenings a week.", "Cooks 5 or more evenings a week.", "Mostly buys food."],
  cleaning: ["Washes up the same night.", "Washes up the next morning.", "Washes up when the pot is needed again."],
  noise: ["Always uses earphones.", "Calls out loud, music on earphones.", "Calls and music out loud."],
};

type Step = "intro" | number | "review";

function Questions() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/profile");
  const [me] = useMe();
  const [step, setStep] = useState<Step>("intro");
  const [ans, setAns] = useState<Partial<Answers>>({});
  const [editing, setEditing] = useState<keyof Answers | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Returning to edit: start from the saved answers on the review screen.
  useEffect(() => {
    const db = supabaseBrowser();
    if (!db || !me) return setLoaded(true);
    db.from("bunkie_answers").select("sleep, guests, cooking, cleaning, noise").eq("user_id", me.user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAns(data as Answers);
          setStep("review");
        }
        setLoaded(true);
      });
  }, [me]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const pick = (i: number) => {
    if (typeof step !== "number") return;
    const q = QUESTIONS[step];
    setAns((a) => ({ ...a, [q.key]: i }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStep(step + 1 >= QUESTIONS.length ? "review" : step + 1), 260);
  };

  const approve = async () => {
    const db = supabaseBrowser();
    if (!db || !me) return;
    setBusy(true);
    setError(null);
    const now = new Date().toISOString();
    const { error } = await db.from("bunkie_answers").upsert({ user_id: me.user.id, ...(ans as Answers), pledged_at: now, approved_at: now });
    setBusy(false);
    if (error) return setError(errorText(error));
    router.replace(next);
  };

  const progress = step === "intro" ? 0 : step === "review" ? 1 : step / QUESTIONS.length;

  if (!loaded) return <Loading />;

  if (step === "review") {
    return (
      <main className="screen">
        <div className="topbar"><button className="ib" aria-label="Back" onClick={() => setStep(QUESTIONS.length - 1)}><ChevronLeft size={24} /></button></div>
        <div className="body">
          <div className="stack" style={{ gap: 6 }}>
            <h1 className="h1">Your bunkie profile</h1>
            <p className="sub">Hosts see this when you request.</p>
          </div>
          <div className="lrows">
            {QUESTIONS.map((q) => (
              <div key={q.key} className="lrow" style={{ alignItems: "flex-start", padding: "14px 0", flexDirection: "column", gap: 6 }}>
                <div className="between" style={{ width: "100%" }}>
                  <span className="lbl">{q.topic}</span>
                  <button className="link" style={{ height: 32, fontSize: 14 }} aria-label={`Edit ${q.topic.toLowerCase()}`}
                    onClick={() => setEditing(editing === q.key ? null : q.key)}>
                    {editing === q.key ? <X size={16} /> : <Pencil size={16} />}
                  </button>
                </div>
                {editing === q.key ? (
                  <div className="chips open" role="radiogroup" aria-label={q.topic}>
                    {q.options.map((o, i) => (
                      <button key={o} role="radio" aria-checked={ans[q.key] === i} className={ans[q.key] === i ? "chip on" : "chip"}
                        onClick={() => { setAns((a) => ({ ...a, [q.key]: i })); setEditing(null); }}>{o}</button>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: 16 }}>{SENTENCE[q.key][ans[q.key] ?? 0]}</span>
                )}
              </div>
            ))}
          </div>
          {error && <p className="err" role="alert">{error}</p>}
        </div>
        <div className="foot"><button className="btn" disabled={busy} onClick={approve}>{busy ? <span className="spin" /> : "Looks good"}</button></div>
      </main>
    );
  }

  return (
    <main className="screen">
      <div className="topbar">
        {step === "intro"
          ? <button className="ib" aria-label="Back" onClick={() => router.back()}><ChevronLeft size={24} /></button>
          : <button className="ib" aria-label="Previous question" onClick={() => setStep(step === 0 ? "intro" : (step as number) - 1)}><ChevronLeft size={24} /></button>}
      </div>
      <Progress value={progress} />
      {step === "intro" ? (
        <>
          <div className="body" style={{ justifyContent: "center", gap: 16 }}>
            <span className="avatar" style={{ width: 64, height: 64, fontSize: 26, background: "var(--ink)", color: "var(--amber)" }}>{me?.profile.first_name?.[0] ?? "B"}</span>
            <h1 className="h1">Meet your dream bunkie</h1>
            <p className="sub">5 quick questions. You only do this once.</p>
          </div>
          <div className="foot"><button className="btn" onClick={() => setStep(0)}>Start</button></div>
        </>
      ) : (
        <div className="body open" key={step} style={{ gap: 16, paddingTop: 20 }}>
          <span className="lbl">{(step as number) + 1} of 5 · {QUESTIONS[step as number].topic}</span>
          <h1 className="h1">{QUESTIONS[step as number].question}</h1>
          <div role="radiogroup" aria-label={QUESTIONS[step as number].topic} className="stack" style={{ gap: 10 }}>
            {QUESTIONS[step as number].options.map((o, i) => {
              const on = ans[QUESTIONS[step as number].key] === i;
              return (
                <button key={o} role="radio" aria-checked={on} className={on ? "opt on" : "opt"} style={{ minHeight: 58, justifyContent: "space-between" }} onClick={() => pick(i)}>
                  {o}{on && <Check size={20} color="var(--green)" strokeWidth={2.6} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return <Suspense><RequireAuth next="/questions"><Questions /></RequireAuth></Suspense>;
}
