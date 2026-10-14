"use client";
import { useState } from "react";
import { TopBar } from "@/components/ui";
import { EMAIL_RE } from "@/components/auth";
import { supabaseBrowser } from "@/lib/supabase/client";

const STATES = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"];

export default function Waitlist() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const [done, setDone] = useState(false);
  const join = async () => {
    await supabaseBrowser()?.from("waitlist").insert({ email, state });
    setDone(true);   // A repeat sign-up is fine to treat as done.
  };
  return (
    <main className="screen">
      <TopBar back />
      <div className="body">
        <h1 className="h1">Join the waitlist</h1>
        {done ? <div className="banner green">You&apos;re on the list for {state}.</div> : (
          <>
            <div className="stack"><label className="lbl" htmlFor="state">State you&apos;re posted to</label>
              <select id="state" className="sel" value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">Pick a state</option>{STATES.map((s) => <option key={s}>{s}</option>)}
              </select></div>
            <div className="stack"><label className="lbl" htmlFor="email">Email</label>
              <label className="field"><input id="email" type="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value.trim())} /></label></div>
          </>
        )}
      </div>
      {!done && <div className="foot"><button className="btn" disabled={!state || !EMAIL_RE.test(email)} onClick={join}>Join</button></div>}
    </main>
  );
}
