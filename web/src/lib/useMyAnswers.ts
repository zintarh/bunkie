"use client";
import { useEffect, useState } from "react";
import { useMe } from "./auth";
import { supabaseBrowser } from "./supabase/client";
import type { Answers } from "./types";

/** The signed-in person's bunkie answers, or null before they've answered. */
export function useMyAnswers(): Answers | null {
  const [me] = useMe();
  const [answers, setAnswers] = useState<Answers | null>(null);
  useEffect(() => {
    const db = supabaseBrowser();
    if (!me || !db) return setAnswers(null);
    db.from("bunkie_answers").select("sleep, guests, cooking, cleaning, noise").eq("user_id", me.user.id).maybeSingle()
      .then(({ data }) => setAnswers((data as Answers) ?? null));
  }, [me]);
  return answers;
}
