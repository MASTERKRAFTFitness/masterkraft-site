// Bot filtering for the public forms.
//
// Every form on this site posted straight through to HubSpot, Resend and Steve's
// inbox with nothing in the way: no honeypot, no rate limit, no captcha. The
// warranty form is where it started to hurt, because that route emails a human
// on every submission by design (a lost claim is a customer with broken kit), so
// a form-filler bot turns directly into inbox noise for the MD.
//
// What we are actually up against, from the 9 September sample: random strings in
// every field - name "Jymyyqqw", product "vUwHtWUifxAvLRekCeOlIDT", fault
// "ForlvKQIQhZVEMOFcElc", purchase date 1970-05-31. A generic form-filler that
// walks the DOM, types junk into every input and posts. It is not targeting us
// and it is not clever, which is what makes cheap defences worth having.
//
// Three layers, in order of how much they can be trusted:
//
//   1. HONEYPOT - a field a human never sees and a form-filler always fills.
//      Near zero false positives, so it blocks on its own.
//   2. FILL TIME - how long the form was on screen. A duration measured on the
//      client, NOT a timestamp, so a wrong system clock cannot lock anyone out.
//      Blocks on its own; the floor is per-form.
//   3. SHAPE OF THE TEXT - random-case runs, consonant walls, absurd dates.
//      Heuristics, so they are deliberately NOT trusted alone: it takes two
//      independent fields looking machine-generated before this blocks.
//
// Plus a per-IP rate limit, which is the only thing here that helps if the bot
// gets smarter about the first three.
//
// HONEST LIMITATION: layers 1-3 all depend on the client, so anything posting
// straight at the JSON API can dodge them by simply not sending the honeypot and
// copying a plausible elapsed time. That is a different and much rarer opponent
// than the one filling in our forms today. If these get through, the next step is
// Cloudflare Turnstile - which needs an account and two env vars, and was
// deliberately left out of this pass so the fix ships without waiting on anyone.
//
// The caller's job on a block is to SAY NOTHING: return the ordinary success
// shape and send no email. A bot that is told what tripped it tunes around it;
// a bot that thinks it succeeded moves on.

import { visitorKey } from "@/lib/agent/rate-limit";
import { HONEYPOT_FIELD, ELAPSED_FIELD } from "@/lib/form-fields";

// Shared with the client components, which render these. Re-exported so routes
// and tests have one import for the whole filter.
export { HONEYPOT_FIELD, ELAPSED_FIELD } from "@/lib/form-fields";

/** Default floor for a form with several fields to type. */
export const MIN_ELAPSED_MS = 2500;
/** For a single-input form (newsletter) where paste-and-go is genuinely quick. */
export const MIN_ELAPSED_MS_SHORT = 1200;

// A person lodging claims for a gym full of broken equipment is real and should
// not be stopped, so these are loose. They exist to break a flood, not to police
// ordinary use. Note these are per IP, and an office or a mobile carrier can put
// many real people behind one.
export const PER_WINDOW = 10;
export const WINDOW_MS = 10 * 60_000;
export const PER_DAY = 25;

export type SpamReason = "honeypot" | "too_fast" | "rate_limit" | "gibberish";

/**
 * What to say when someone trips the rate limit.
 *
 * The other three verdicts are answered with silence and an ordinary success
 * shape, because telling a bot which layer caught it is how it tunes around the
 * layer. The rate limit is the exception, and deliberately so: it is the only
 * verdict a REAL person can trip - a facility manager lodging claims for a room
 * full of broken equipment, everyone in an office behind one NAT address - and
 * this codebase's whole position on warranty claims is that silently swallowing
 * one is worse than any amount of spam. So that case gets told, honestly, with
 * somewhere else to go. A bot learns nothing from it that it can use.
 */
export const RATE_LIMITED_MESSAGE =
  "That is more submissions than we accept from one connection in a short time. " +
  "If this is genuine, please email hello@masterkraft.com and we will pick it up from there.";
export type GuardVerdict = { ok: true } | { ok: false; reason: SpamReason; detail: string };

const isLetter = (c: string) => /[A-Za-z]/.test(c);
const isUpper = (c: string) => c !== c.toLowerCase();
// `y` counts as a vowel on purpose. Without it, real surnames with few written
// vowels - Krzysztof, Grzyb - read as machine noise, and a warranty form that
// rejects someone's name is worse than a bot that gets through.
const isVowel = (c: string) => "aeiouy".includes(c.toLowerCase());

/**
 * Does one word look like it came out of a random generator?
 *
 * Only words of 8+ letters are judged. Short ones carry too little signal, and
 * genuine product codes are short and upper case.
 */
export function looksGenerated(word: string): boolean {
  if (word.length < 8) return false;

  // Capitals appearing mid-word after a lowercase letter. Real words do this at
  // most once - MasterKraft, McDonald, iPhone - and random case does it
  // constantly: vUwHtWUifxAvLRekCeOlIDT flips eight times. Counting only
  // lower->upper (not every case change) is what keeps CamelCase out of it.
  let flips = 0;
  for (let i = 1; i < word.length; i++) {
    if (isUpper(word[i]) && !isUpper(word[i - 1])) flips++;
  }
  if (flips >= 3) return true;

  // A wall of consonants. Five in a row is past what English builds. Only
  // letters count towards a run - a digit BREAKS it, or a genuine product code
  // like MKRB450X reads as eight consonants and a real claim gets dropped.
  let run = 0;
  for (const c of word) {
    if (!isLetter(c)) { run = 0; continue; }
    run = isVowel(c) ? 0 : run + 1;
    if (run >= 5) return true;
  }

  return false;
}

/** Every letter-run in a value, so punctuation and digits do not skew the read. */
const words = (value: string) => value.split(/[^A-Za-z]+/).filter(Boolean);

/**
 * Which of these fields read as machine-generated. Returns names, not a count,
 * so the reason logged against a blocked submission says which fields gave it
 * away - without that, a false positive is impossible to diagnose after the fact.
 */
export function generatedFields(fields: Record<string, string>): string[] {
  return Object.entries(fields)
    .filter(([, value]) => value && words(value).some(looksGenerated))
    .map(([name]) => name);
}

/**
 * A date that no real purchase has. The bot's 1970-05-31 is the giveaway - an
 * epoch-adjacent value straight out of a generator - and a purchase in the
 * future is equally impossible. The floor is generous: equipment genuinely does
 * last decades, and a claim on something old should be assessed and declined by
 * a person, not swallowed here.
 */
export function impossibleDate(value: string, now: number): boolean {
  if (!value) return false;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return false; // not our business to validate formats
  return t > now || new Date(t).getUTCFullYear() < 1990;
}

type Hit = { count: number; resetAt: number };
const buckets = new Map<string, Hit>();

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, hit] of buckets) {
    if (hit.resetAt <= now) buckets.delete(key);
  }
}

function bump(key: string, limit: number, windowMs: number, now: number): boolean {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  existing.count += 1;
  return existing.count <= limit;
}

export type GuardOptions = {
  /** Form name, for the log line only. */
  form: string;
  /** Human-typed values to judge on shape. Omit anything free-form enough to misfire. */
  fields?: Record<string, string>;
  /** Date values that should fall in the plausible past. */
  dates?: Record<string, string>;
  /** Floor on how long the form was on screen. */
  minElapsedMs?: number;
  now?: number;
};

/**
 * Decide whether a submission came from a person.
 *
 * The rate limit is counted for EVERY submission including blocked ones - a bot
 * that trips the honeypot a hundred times should still exhaust its allowance,
 * or the cheapest layer becomes the one that costs us the most requests.
 */
export function checkFormSubmission(
  request: Request,
  body: Record<string, unknown>,
  opts: GuardOptions
): GuardVerdict {
  const now = opts.now ?? Date.now();
  const visitor = visitorKey(request);

  prune(now);
  const withinWindow = bump(`w:${visitor}`, PER_WINDOW, WINDOW_MS, now);
  const withinDay = bump(`d:${visitor}`, PER_DAY, 24 * 60 * 60_000, now);

  const honeypot = body[HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim()) {
    return { ok: false, reason: "honeypot", detail: `${opts.form}: hidden field filled` };
  }

  // Absent is fine and stays fine: a direct API caller sends no elapsed time, and
  // so does anyone still holding the JavaScript bundle from before this shipped.
  // Only a value we can read and that is impossibly short blocks.
  const elapsed = Number(body[ELAPSED_FIELD]);
  const floor = opts.minElapsedMs ?? MIN_ELAPSED_MS;
  if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < floor) {
    return { ok: false, reason: "too_fast", detail: `${opts.form}: submitted in ${elapsed}ms` };
  }

  if (!withinWindow || !withinDay) {
    return { ok: false, reason: "rate_limit", detail: `${opts.form}: ${visitor} over the cap` };
  }

  // Two independent fields, because one odd-looking value is a person with an
  // unusual name or a product code we have never seen, and two is a generator.
  const flagged = generatedFields(opts.fields ?? {});
  for (const [name, value] of Object.entries(opts.dates ?? {})) {
    if (impossibleDate(value, now)) flagged.push(name);
  }
  if (flagged.length >= 2) {
    return { ok: false, reason: "gibberish", detail: `${opts.form}: ${flagged.join(", ")}` };
  }

  return { ok: true };
}

/** Test seam. Nothing in the app should call this. */
export function __resetFormLimits() {
  buckets.clear();
}
