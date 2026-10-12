import type { Answers, Household, SharePref } from "./types";

/** The five bunkie questions, in order. Answers are stored as option indexes. */
export const QUESTIONS: { key: keyof Answers; topic: string; question: string; options: string[]; summary: string[] }[] = [
  {
    key: "sleep", topic: "Sleep", question: "On a weekday, when do you usually fall asleep?",
    options: ["Before 10pm", "10pm to midnight", "After midnight", "It changes a lot"],
    summary: ["Asleep before 10pm", "Asleep by midnight", "Night owl", "Sleep times vary"],
  },
  {
    key: "guests", topic: "Guests", question: "Last month, how many nights did someone sleep over?",
    options: ["None", "1 or 2 nights", "Most weekends", "More than that"],
    summary: ["No overnight guests", "Rare overnight guests", "Guests most weekends", "Guests often"],
  },
  {
    key: "cooking", topic: "Cooking", question: "Last week, how many evenings did you cook?",
    options: ["0 or 1", "2 to 4", "5 or more", "I mostly buy food"],
    summary: ["Cooks now and then", "Cooks a few evenings", "Cooks most evenings", "Mostly buys food"],
  },
  {
    key: "cleaning", topic: "Cleaning", question: "After you cook, when do you wash up?",
    options: ["Same night", "Next morning", "When I need the pot again"],
    summary: ["Washes up the same night", "Washes up next morning", "Washes up when needed"],
  },
  {
    key: "noise", topic: "Noise", question: "How do you take calls and play music at home?",
    options: ["Earphones always", "Calls out loud, music on earphones", "Both out loud"],
    summary: ["Earphones always", "Calls out loud, music on earphones", "Calls and music out loud"],
  },
];

export function summaryLines(a: Answers): string[] {
  return QUESTIONS.map((q) => q.summary[a[q.key]] ?? "");
}

/** 0-100 fit between two people, plus the topics where they line up. */
export function fit(me: Answers | null, them: Answers | null): { score: number; matches: string[]; differs: string[] } | null {
  if (!me || !them) return null;
  let penalty = 0;
  const matches: string[] = [];
  const differs: string[] = [];
  for (const q of QUESTIONS) {
    const d = Math.abs(me[q.key] - them[q.key]);
    // "It changes a lot" / "I mostly buy food" are soft answers: count as half apart.
    const soft = q.options.length === 4 && (me[q.key] === 3 || them[q.key] === 3);
    const gap = soft ? 0.5 : d;
    penalty += gap;
    if (gap === 0) matches.push(q.topic.toLowerCase());
    else if (gap >= 2) differs.push(q.topic.toLowerCase());
  }
  return { score: Math.max(0, Math.round(100 - penalty * 9)), matches, differs };
}

export const HOUSEHOLD_LABEL: Record<Household, string> = { women: "Women", men: "Men", mixed: "Mixed" };
export const PREF_LABEL: Record<SharePref, string> = { women_only: "Women only", men_only: "Men only", mixed_ok: "Mixed is fine" };

export const CLOSE_REASON: Record<string, string> = {
  withdrawn: "You withdrew this request.",
  host_declined: "The host said no this time.",
  host_no_reply: "The host didn't reply in time.",
  no_viewing_picked: "No viewing time was picked in time.",
  no_response: "Nobody confirmed the viewing in time.",
  tenant_no_show: "The tenant didn't show up to the viewing.",
  host_no_show: "The host didn't show up to the viewing.",
  not_as_listed: "The room wasn't as listed.",
  cant_get_in: "You couldn't get in on move-in day. Your money is coming back.",
  tenant_no_confirm: "The agreement wasn't confirmed in time.",
  not_paid: "Payment wasn't made in time, so the room was released.",
  host_cancelled: "The host cancelled. You get a full refund.",
  room_taken: "Someone else booked this room for these dates.",
  booked_elsewhere: "You booked another room.",
  paid_after_close: "This payment came in after the booking closed. It's being refunded.",
};
