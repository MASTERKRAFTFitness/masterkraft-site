// Indie Iron: the independent gym buying group, at /indie-iron.
//
// Content and the buy-window calendar live here, as data, so the page, the
// sign-up form and the API route all read the same lists. A select option and
// the HubSpot property it lands in have to stay in step, and the route rejects
// anything not listed here.
//
// THREE EDITING RULES, all from the approved brief (doc 62/64, 19 Oct 2026):
//
// 1. "Buying Group" is ours. "Certified Independent Gym" belongs to member
//    gyms, so on this page the seal only ever appears as what a member gets.
// 2. "6–8 weeks" is an APPROVED EXCEPTION to the never-state-lead-times rule,
//    for Indie Iron only. Do not copy it anywhere else on the site.
// 3. Never "cheap", and never pricing tiers: talk about the member's price
//    advantage. No mention of where the gear is made.

/** Lead time from window close to the member's floor, in days (6–8 weeks). */
export const LAND_MIN_DAYS = 42;
export const LAND_MAX_DAYS = 56;

/** Windows close on the 15th of these months (0-based): Feb, May, Aug, Nov. */
const CLOSE_MONTHS = [1, 4, 7, 10] as const;
const SEASON: Record<number, string> = { 1: "Autumn", 4: "Winter", 7: "Spring", 10: "Summer" };

/** The first window. It keeps its own name; every later one is named by season. */
const FOUNDING = { year: 2026, month: 10 };

export type BuyWindow = {
  /** Stable id, e.g. "2026-11". Also what the form submits. */
  id: string;
  name: string;
  /** The exact instant orders close: 23:59 Melbourne time on the 15th. */
  closesAt: Date;
  /** Calendar date of the close, as UTC midnight, for display. */
  closeDate: Date;
  landFrom: Date;
  landTo: Date;
};

const DAY = 86_400_000;

// 23:59 in Melbourne on the 15th. February and November fall inside daylight
// saving (AEDT, UTC+11) every year; May and August never do (AEST, UTC+10). So
// the offset is fixed per month and no time-zone database is needed.
function closeInstant(year: number, month: number): Date {
  const offsetHours = month === 1 || month === 10 ? 11 : 10;
  return new Date(Date.UTC(year, month, 15, 23 - offsetHours, 59));
}

function makeWindow(year: number, month: number): BuyWindow {
  const closeDate = new Date(Date.UTC(year, month, 15));
  const founding = year === FOUNDING.year && month === FOUNDING.month;
  return {
    id: `${year}-${String(month + 1).padStart(2, "0")}`,
    name: founding ? "Founding round" : SEASON[month],
    closesAt: closeInstant(year, month),
    closeDate,
    landFrom: new Date(closeDate.getTime() + LAND_MIN_DAYS * DAY),
    landTo: new Date(closeDate.getTime() + LAND_MAX_DAYS * DAY),
  };
}

/**
 * The next `count` windows that have not yet closed at `now`, soonest first.
 * Never returns one before the founding round. Computed from dates rather than
 * a hard-coded list, so the calendar keeps rolling without a code change.
 */
export function upcomingWindows(now: Date, count = 4): BuyWindow[] {
  const out: BuyWindow[] = [];
  let year = Math.max(now.getUTCFullYear() - 1, FOUNDING.year);
  while (out.length < count) {
    for (const month of CLOSE_MONTHS) {
      if (year === FOUNDING.year && month < FOUNDING.month) continue;
      const w = makeWindow(year, month);
      if (w.closesAt.getTime() > now.getTime()) out.push(w);
      if (out.length === count) break;
    }
    year++;
  }
  return out;
}

// Dates are formatted by hand rather than with toLocaleDateString: en-AU writes
// "Sept", "June" and "Sun, 15 Nov" in some runtimes and not others, and the
// server-free calendar has to read the same in every browser.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayMonth = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
const dayMonthYear = (d: Date) => `${dayMonth(d)} ${d.getUTCFullYear()}`;

/** "Sun 15 Nov 2026" */
export const formatClose = (w: BuyWindow) => `${DAYS[w.closeDate.getUTCDay()]} ${dayMonthYear(w.closeDate)}`;

/** "27 Dec 2026 – 10 Jan 2027", or "29 Mar – 12 Apr 2027" within one year. */
export function formatLanding(w: BuyWindow): string {
  const sameYear = w.landFrom.getUTCFullYear() === w.landTo.getUTCFullYear();
  return `${sameYear ? dayMonth(w.landFrom) : dayMonthYear(w.landFrom)} – ${dayMonthYear(w.landTo)}`;
}

/** "27 Dec – 10 Jan", for the hero clock where space is tight. */
export const formatLandingShort = (w: BuyWindow) => `${dayMonth(w.landFrom)} – ${dayMonth(w.landTo)}`;

/** What the form submits into `indie_iron_window`, e.g. "Founding round (closes 15 Nov 2026)". */
export const windowLabel = (w: BuyWindow) =>
  `${w.name} (closes ${dayMonthYear(w.closeDate)})`;

export const NOT_SURE_WINDOW = "Not sure";

// ---- form options: these match the HubSpot property options exactly --------

export const STATE_OPTIONS = ["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT", "New Zealand"];

/** `indie_iron_sites` (dropdown). */
export const SITE_OPTIONS = ["1", "2–3", "4–10", "10+"];

/** `indie_iron_products` (multiple checkboxes). */
export const PRODUCT_OPTIONS = ["Plates", "Kettlebells", "Medicine balls", "Dumbbells", "Fixed barbells"];

/** `indie_iron_branding` (radio). */
export const BRANDING_OPTIONS = [
  { value: "My gym logo", label: "My gym's logo" },
  { value: "MasterKraft", label: "MasterKraft" },
  { value: "Not sure", label: "Not sure yet" },
];

export const CONSENT_TEXT =
  "I'd like MasterKraft to contact me about Indie Iron and send buy-window reminders. I can unsubscribe any time.";

// ---- page content ------------------------------------------------------------

export const STEPS = [
  { title: "Join free", body: "Tell us about your gym. We set you up with member pricing and a login." },
  { title: "Build your order", body: "Pick your range and weights, then send your logo. We send a branding proof to sign off." },
  { title: "Window closes", body: "All member orders go into one production run. Deposit on close, balance before dispatch." },
  { title: "On your floor", body: "Delivered 6–8 weeks after the window closes, with your brand on every piece." },
];

// Weight ranges are indicative until Steve confirms them (open item 3).
export const RANGE = [
  {
    name: "Plates",
    spec: "1.25 – 25 kg",
    body: "Bumper and iron plates with your logo on the face. The hero piece of any branded floor.",
    href: "/equipment/weightlifting/weight-plates",
    icon: "plate",
  },
  {
    name: "Kettlebells",
    spec: "4 – 48 kg",
    body: "Single-cast bells with your logo on the body and the weight marked in kg.",
    href: "/equipment/mixed-implements/kettlebells",
    icon: "kettlebell",
  },
  {
    name: "Medicine balls",
    spec: "2 – 10 kg",
    body: "Grippy, wall-ball friendly balls with your gym's mark printed on.",
    href: "/equipment/mixed-implements/wall-balls",
    icon: "ball",
  },
  {
    name: "Dumbbells",
    spec: "2.5 – 50 kg pairs",
    body: "Commercial dumbbell sets with branded heads, sold in pairs and full runs.",
    href: "/equipment/mixed-implements/dumbbells",
    icon: "dumbbell",
  },
  {
    name: "Fixed barbells",
    spec: "10 – 50 kg",
    body: "Pre-loaded straight and curl bars for the rack, with branded end caps.",
    href: "/equipment/weightlifting/barbells",
    icon: "barbell",
  },
] as const;

export const ALONE = [
  "Retail pricing, every time",
  "Custom branding often costs extra or needs a big minimum",
  "Freight paid on a small, one-off shipment",
  "You chase the order yourself",
];

export const IN_GROUP = [
  "Up to 30% off RRP on the five core lines",
  "Your logo on every piece, with a proof first",
  "One production run, shipped together",
  "A set date, every quarter, so you can plan",
];

// Minimum and deposit wording stays general until open item 4 is settled.
export const FAQ = [
  { q: "Does it cost anything to join?", a: "No. Membership is free. You pay only for what you order in a window." },
  { q: "Do I have to order every quarter?", a: "No. Order in the windows that suit you and skip the rest. There's no lock-in." },
  {
    q: "Is there a minimum order?",
    a: "Your order is pooled with every other member's, so the volume comes from the group, not from you. Branded items have a small per-logo minimum, and we'll confirm it on your quote.",
  },
  {
    q: "How does branding work?",
    a: "Send us your logo as a vector file. We send a proof for each item. Nothing goes into production until you approve it.",
  },
  { q: "When do I pay?", a: "A deposit when the window closes and the balance before dispatch. Your quote shows the exact amounts." },
  {
    q: "Who is behind Indie Iron?",
    a: "MasterKraft, a commercial gym equipment supplier working with large franchise networks and independent gym owners alike. Indie Iron is how independents get network buying power.",
  },
  { q: "What if I miss a window?", a: "Your order rolls into the next one. You can also buy outside the group at normal pricing any time." },
  {
    q: "Can I add other equipment?",
    a: "The group buy covers the five free-weight lines. For racks, rigs, flooring or a full fit-out, ask and we'll quote it separately.",
  },
];

// ---- member pricing (DRAFT) ---------------------------------------------------
//
// TO BE CONFIRMED. These are the 14 Oct 2026 branded-kit numbers (price matrix
// in the migration folder, Unleashed prices read that day): a member's trade
// login is 10% off the website price, and an order in a buy window is 15% off,
// a further 5%. They do not yet agree with the brief's "up to 30% off RRP"
// (open item 1), so the table stays off the live page until PRICING_CONFIRMED
// is true. Until then it shows only with ?pricing=draft on the URL.
//
// Labels are Website / Member / Buying group, never tier names: the brand rule
// is to talk about the member's price advantage, not pricing tiers.

export const PRICING_CONFIRMED = false;

export const MEMBER_DISCOUNT = 0.1;
export const GROUP_DISCOUNT = 0.15;

/** One example size per line. Website prices inc GST, from Unleashed on 14 Oct 2026. */
export const PRICE_EXAMPLES = [
  { line: "Plates", item: "Competition bumper plate, 20 kg", website: 225, method: "Laser engraved", fee: 125 },
  { line: "Kettlebells", item: "Urethane competition kettlebell, 16 kg", website: 160, method: "PVC label", fee: 50 },
  { line: "Medicine balls", item: "Medicine ball, 6 kg", website: 64, method: "Printed", fee: 50 },
  { line: "Dumbbells", item: "Urethane dumbbells, 10 kg pair", website: 176, method: "PVC label", fee: 50 },
  { line: "Fixed barbells", item: "Urethane fixed barbell, 20 kg", website: 170, method: "PVC label", fee: 50 },
] as const;

/** Who pays the branding fees, by order value ex GST: Steve's email of 13 Oct 2026. */
export const BRANDING_ABSORPTION = [
  { over: 0, share: "You pay the fee" },
  { over: 20000, share: "We pay half" },
  { over: 50000, share: "We pay all of it" },
];

/** Website price less a discount, to the cent. */
export const discounted = (website: number, discount: number) => Math.round(website * (1 - discount) * 100) / 100;
