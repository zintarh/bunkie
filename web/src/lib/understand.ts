import "server-only";
import type { RoomKind, SharePref } from "./types";

/** What a typed search means. Every field is optional: only what the person actually said. */
export type Understood = {
  place?: string;              // "Utako", "Federal Secretariat"
  budgetMax?: number;          // monthly, all in
  room?: RoomKind;
  ownBath?: boolean;
  furnished?: boolean;
  stay?: "weeks" | "short" | "long";
  weeks?: number;
  months?: number;
  pref?: SharePref;
  maxMinutes?: number;
};

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, a: 1, an: 1 };

/** Naira amounts as people type them: 80k, 80,000, ₦80000, 1.2m, 80 thousand. */
function amount(raw: string): number | undefined {
  const m = raw.toLowerCase().replace(/[₦,\s]/g, "").match(/^(\d+(?:\.\d+)?)(k|m|thousand)?$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]) * (m[2] === "k" || m[2] === "thousand" ? 1000 : m[2] === "m" ? 1_000_000 : 1);
  return n >= 1000 && n <= 5_000_000 ? Math.round(n) : undefined;
}

/**
 * Fast rules for the way corpers actually type ("self con near utako under 80k 2 weeks girls only").
 * Always runs; Claude (when configured) refines it.
 */
export function parseRules(q: string): Understood {
  const t = ` ${q.toLowerCase().replace(/\s+/g, " ").trim()} `;
  const u: Understood = {};

  const money = t.match(/(?:under|below|less than|max(?:imum)?|budget(?: of| is)?|not more than|up to|within|<)\s*(₦?\s?[\d.,]+\s?(?:k|m|thousand)?)/)
    ?? t.match(/(₦\s?[\d.,]+\s?(?:k|m|thousand)?|\b\d+(?:\.\d+)?\s?k\b)/);
  if (money) u.budgetMax = amount(money[1]);
  if (!u.budgetMax && /\b(cheap|cheapest|affordable|low budget|budget friendly)\b/.test(t)) u.budgetMax = 50000;

  if (/\bself[ -]?con(tain(ed)?)?\b|\bselfcon\b/.test(t)) u.room = "self_contain";
  else if (/\b(own|private|my own|single) room\b|\broom (to|for) myself\b/.test(t)) u.room = "own_room";
  else if (/\bshared?( room)?\b|\bbunk\b|\broommate\b|\bshare with\b/.test(t)) u.room = "shared_room";

  if (/\b(own|private|my own) (bath(room)?|toilet|loo)\b|\ben[ -]?suite\b/.test(t)) u.ownBath = true;
  if (/\bfurnished\b/.test(t) && !/\bun ?furnished\b/.test(t)) u.furnished = true;

  const wk = t.match(/\b(\d|one|two|three|four|a)\s*(?:-|to)?\s*weeks?\b/);
  const mo = t.match(/\b(\d{1,2}|one|two|three|four|five|six|a|an)\s*months?\b/);
  if (wk) { u.weeks = Math.min(4, Number(wk[1]) || NUM_WORDS[wk[1]] || 1); u.stay = "weeks"; }
  else if (/\bshort stay\b|\bfew (days|weeks)\b|\btemporar(y|ily)\b|\bafter camp\b/.test(t)) u.stay = "weeks";
  else if (mo) { u.months = Math.min(12, Number(mo[1]) || NUM_WORDS[mo[1]] || 1); u.stay = u.months <= 3 ? "short" : u.months >= 6 ? "long" : undefined; }
  else if (/\b(a |one )?year\b|\blong[ -]?term\b/.test(t)) u.stay = "long";

  if (/\b(female|females|girls?|ladies|lady|women|woman|sisters?)\b/.test(t)) u.pref = "women_only";
  else if (/\b(male|males|guys?|boys?|men|man|brothers?)\b/.test(t)) u.pref = "men_only";

  const mins = t.match(/\b(\d{1,2})\s*(?:min|mins|minutes)\b/);
  if (mins) u.maxMinutes = Number(mins[1]);
  else if (/\b(walking distance|very close|close to|near(by)?|around)\b/.test(t)) u.maxMinutes = undefined;

  // Place: after near/in/around/close to/at, up to a word that starts another part of the query.
  const stop = "(?:\\bunder\\b|\\bbelow\\b|\\bfor\\b|\\bwith\\b|\\bless\\b|\\bmax|\\bbudget\\b|\\bwithin\\b|\\bself|\\bown\\b|\\bshared?\\b|\\bfurnished|\\bgirls?\\b|\\bfemale|\\bmale|\\bguys?|\\bladies|\\bmen\\b|\\bwomen\\b|\\d+\\s?(?:k|m|thousand|weeks?|months?|mins?|minutes)\\b|₦|,|\\.|$)";
  const place = t.match(new RegExp(`\\b(?:near|in|around|close to|at|by|off)\\s+(?:the\\s+)?(.+?)\\s*${stop}`));
  if (place) {
    const p = place[1].replace(/\b(abuja|area|my ppa|ppa)\b/g, "").trim();
    if (p.length >= 3) u.place = p.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return u;
}

/** Claude reads looser wording into the same fields. Optional: needs ANTHROPIC_API_KEY. */
export async function askClaude(q: string): Promise<Understood | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.SEARCH_MODEL ?? "claude-haiku-5-5",
      max_tokens: 300,
      system:
        "You turn a Nigerian corp member's room search in Abuja into filters. Use only what they asked for; leave the rest out. " +
        "Nigerian terms: 'self con'/'self contain' = room with its own bathroom and kitchen; 'k' = thousand naira; " +
        "'PPA' = their place of work. Budgets are monthly naira, all in. 'Girls/ladies/female' = women_only; 'guys/male' = men_only. " +
        "place: an Abuja area, street or landmark exactly as written (fix obvious misspellings), not 'Abuja' itself.",
      tools: [{
        name: "search",
        description: "Filters for the room search",
        input_schema: {
          type: "object",
          properties: {
            place: { type: "string" },
            budgetMax: { type: "integer", description: "Monthly budget in naira" },
            room: { type: "string", enum: ["own_room", "shared_room", "self_contain"] },
            ownBath: { type: "boolean" },
            furnished: { type: "boolean" },
            stay: { type: "string", enum: ["weeks", "short", "long"] },
            weeks: { type: "integer", minimum: 1, maximum: 4 },
            months: { type: "integer", minimum: 1, maximum: 12 },
            pref: { type: "string", enum: ["women_only", "men_only", "mixed_ok"] },
            maxMinutes: { type: "integer", minimum: 5, maximum: 90 },
          },
        },
      }],
      tool_choice: { type: "tool", name: "search" },
      messages: [{ role: "user", content: q.slice(0, 300) }],
    }),
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json()) as { content?: { type: string; input?: Understood }[] };
  return data.content?.find((c) => c.type === "tool_use")?.input ?? null;
}
