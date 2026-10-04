// The fitout brief: the shape of what /fitout-solution's wizard collects, the options it
// offers, and how the answers are rendered back out as prose.
//
// Shared by the client wizard and /api/fitout-brief ON PURPOSE. The option lists
// are the contract between them: the route re-renders the brief for HubSpot and
// for the internal email, so if the two sides drifted the sales team would get a
// summary that did not match what the customer clicked.
//
// No server-only imports here - this module is pulled into a client component.
//
// WHY THE ANSWERS END UP AS PROSE IN `message`: HubSpot's Forms API rejects the
// WHOLE submission when it is handed a field the portal does not define (see
// lib/hubspot.ts - a non-2xx throws), and none of these qualification answers
// exist as HubSpot properties yet. Composing them into the one `message` field
// that DOES exist means the brief reaches the CRM today, with no portal config
// and no risk of a lead bouncing. Promoting them to real properties later is a
// HubSpot-side job plus a line each in `briefHubspotFields`.

import { ENQUIRY_KIND, portalEnquiryType } from "@/lib/enquiry-type";

export type Choice = {
  value: string;
  /** Shown on the tap-card. */
  label: string;
  /** One line under the label. Omitted on the denser grids. */
  hint?: string;
  /** Key into the wizard's icon map. */
  icon?: string;
};

/** Step 1 - what the space is. Routes the lead to the right design team. */
export const projectTypes: Choice[] = [
  {
    value: "Commercial Gym",
    label: "Commercial Gym",
    hint: "Full floor, every member catered for",
    icon: "building",
  },
  {
    value: "Boutique Studio",
    label: "Boutique Studio",
    hint: "Group energy, fast throughput",
    icon: "spark",
  },
  {
    value: "Home Gym",
    label: "Home Gym",
    hint: "Commercial quality, domestic space",
    icon: "home",
  },
  {
    value: "PT Studio",
    label: "PT Studio",
    hint: "Small-group and one-to-one coaching",
    icon: "whistle",
  },
  {
    value: "Elite Sports",
    label: "Elite / High Performance",
    hint: "Athlete programs, maximal load",
    icon: "trophy",
  },
  {
    value: "School or University",
    label: "School or University",
    hint: "Education, compliance-led",
    icon: "school",
  },
];

/** Step 1 - how ready they are. The single strongest sort on intent. */
export const projectStages: Choice[] = [
  {
    value: "Ready to quote",
    label: "Ready to quote",
    hint: "Space is confirmed, I want numbers",
    icon: "bolt",
  },
  {
    value: "Planning a build",
    label: "Planning a build",
    hint: "Budgeting now, building this year",
    icon: "calendar",
  },
  {
    value: "Gathering concepts",
    label: "Gathering concepts",
    hint: "Early days, exploring what is possible",
    icon: "lightbulb",
  },
];

/** Step 2 - what stops a rig fitting a room. */
export const obstacleOptions: Choice[] = [
  { value: "Structural pillars", label: "Structural pillars" },
  { value: "Low pipes or ducting", label: "Low pipes or ducting" },
  { value: "Irregular room shape", label: "Irregular room shape" },
  { value: "Multi-level or mezzanine", label: "Multi-level or mezzanine" },
  { value: "Restricted access or lift only", label: "Restricted access / lift only" },
  { value: "Nothing unusual", label: "Nothing unusual" },
];

/** Step 3 - the zones to lay out. */
export const zoneOptions: Choice[] = [
  { value: "Cardio", label: "Cardio", icon: "cardio" },
  { value: "Strength machines", label: "Strength Machines", icon: "machine" },
  { value: "Free weights", label: "Free Weights", icon: "dumbbell" },
  { value: "Rigs and racks", label: "Rigs & Racks", icon: "rig" },
  { value: "Functional training or turf", label: "Functional / Turf", icon: "turf" },
  { value: "Group fitness", label: "Group Fitness", icon: "group" },
  { value: "Recovery", label: "Recovery", icon: "recovery" },
  { value: "Storage", label: "Storage", icon: "storage" },
];

/**
 * Step 3 - branding. Asked as "do you want this in your own colours", NOT as
 * "which brand do you prefer": MasterKraft manufactures the equipment, so a
 * competitor-brand question invites the wrong answer, and custom branding is the
 * thing that actually changes the build (see FernwoodPakenhamCaseStudy - their whole range
 * is produced in their magenta). Copy guardrail: never say "cheap".
 */
export const brandingOptions: Choice[] = [
  {
    value: "I'd like custom branded",
    label: "I'd Like Custom Branded",
    hint: "Our engineers build it in your colourways, with your logo",
    icon: "palette",
  },
  {
    value: "Standard finishes are fine",
    label: "Standard Finishes",
    hint: "The stock MasterKraft look, ready to ship sooner",
    icon: "check",
  },
  {
    value: "Not sure - show me both",
    label: "Show Me Both",
    hint: "Price it either way and let me choose",
    icon: "lightbulb",
  },
];

/**
 * Step 4 - budget as bands, never an exact figure. A required "what will you
 * spend" box is where a high-intent commercial lead abandons the form.
 */
export const budgetOptions: Choice[] = [
  { value: "Under $10k", label: "Under $10k" },
  { value: "$10k - $50k", label: "$10k – $50k" },
  { value: "$50k - $150k", label: "$50k – $150k" },
  { value: "$150k+", label: "$150k+" },
  { value: "Not sure yet", label: "Not sure yet" },
];

/** Step 4 - when they need it standing. */
export const timelineOptions: Choice[] = [
  { value: "As soon as possible", label: "ASAP" },
  { value: "1-3 months", label: "1–3 months" },
  { value: "3-6 months", label: "3–6 months" },
  { value: "6-12 months", label: "6–12 months" },
  { value: "Still exploring", label: "Still exploring" },
];

export const areaUnits = ["m²", "sq ft"] as const;
export const heightUnits = ["m", "ft"] as const;

/** What the client posts and the route reads back. Every field is optional except contact. */
export type FitoutBrief = {
  projectType: string;
  stage: string;
  floorArea: string;
  areaUnit: string;
  ceilingHeight: string;
  heightUnit: string;
  obstacles: string[];
  zones: string[];
  branding: string;
  budget: string;
  timeline: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  postcode: string;
  message: string;
};

export const emptyBrief: FitoutBrief = {
  projectType: "",
  stage: "",
  floorArea: "",
  areaUnit: areaUnits[0],
  ceilingHeight: "",
  heightUnit: heightUnits[0],
  obstacles: [],
  zones: [],
  branding: "",
  budget: "",
  timeline: "",
  firstName: "",
  lastName: "",
  company: "",
  email: "",
  phone: "",
  postcode: "",
  message: "",
};

/** An uploaded floor plan, described for the summary. The bytes travel separately. */
export type BriefAttachment = { filename: string; size: number };

export const MAX_FILES = 4;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Kept under Resend's 40MB ceiling with room for the HTML body and base64 overhead. */
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_UPLOAD_TYPES =
  "image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf";

export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `92 m²`, or "" when they skipped it. Unit is only meaningful with a number. */
function dimension(value: string, unit: string): string {
  const n = value.trim();
  if (!n) return "";
  return `${n} ${unit}`.trim();
}

export function briefFullName(b: Pick<FitoutBrief, "firstName" | "lastName">): string {
  return [b.firstName.trim(), b.lastName.trim()].filter(Boolean).join(" ");
}

/**
 * The brief as labelled lines - what goes into HubSpot's `message` and, as a
 * table, into the internal email.
 *
 * Empty answers are DROPPED rather than rendered as "-": every field past the
 * contact details is optional by design, and a summary padded with twelve blanks
 * buries the three answers the customer did give.
 */
export function briefLines(
  brief: FitoutBrief,
  attachments: BriefAttachment[] = []
): [string, string][] {
  const rows: [string, string][] = [
    ["Fitout type", brief.projectType],
    ["Project stage", brief.stage],
    ["Floor area", dimension(brief.floorArea, brief.areaUnit)],
    ["Ceiling height", dimension(brief.ceilingHeight, brief.heightUnit)],
    ["Obstacles", brief.obstacles.join(", ")],
    ["Zones wanted", brief.zones.join(", ")],
    ["Branding", brief.branding],
    ["Budget", brief.budget],
    ["Timeline", brief.timeline],
    ["Postcode", brief.postcode],
    [
      "Floor plans",
      attachments.map((a) => `${a.filename} (${humanBytes(a.size)})`).join(", "),
    ],
    ["Notes", brief.message],
  ];
  return rows.filter(([, value]) => value.trim() !== "");
}

/**
 * Where the visitor came from, read off the URL they submitted on: the five
 * standard UTM tags, plus whether an ad platform appended its click id.
 *
 * WHY IN THE BRIEF AS WELL AS HUBSPOT'S OWN TRACKING: HubSpot's original source
 * only works for a visitor who accepted cookies (see hubspotUtk in lib/hubspot).
 * The tags in the URL need no cookie, so writing them into the brief means a
 * salesperson can still see "instagram / paid_social, ad C1" on a lead from
 * someone who declined - and the paid campaign can be judged on every lead it
 * produced, not just the consenting share.
 *
 * Click ids are recorded as PRESENCE only. The id itself identifies one click,
 * is no use to a salesperson, and is not ours to store.
 */
export type BriefAttribution = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  /** "Meta" or "Google" when the ad platform tagged the click, else "". */
  clickFrom: string;
};

const UTM_KEYS = {
  source: "utm_source",
  medium: "utm_medium",
  campaign: "utm_campaign",
  content: "utm_content",
  term: "utm_term",
} as const;

/** UTM values are ours to choose, so anything past this is not one of ours. */
const MAX_UTM = 100;

/**
 * Parsed from a raw query string. Runs on the SERVER against what the client
 * sent, so it is the trust boundary: every value is trimmed, length-capped and
 * stripped of control characters before it reaches HubSpot or an email.
 */
export function briefAttribution(search: string): BriefAttribution {
  const params = new URLSearchParams(search.slice(0, 2000));
  const read = (key: string) =>
    (params.get(key) ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, MAX_UTM);
  return {
    source: read(UTM_KEYS.source),
    medium: read(UTM_KEYS.medium),
    campaign: read(UTM_KEYS.campaign),
    content: read(UTM_KEYS.content),
    term: read(UTM_KEYS.term),
    clickFrom: params.has("fbclid") ? "Meta" : params.has("gclid") ? "Google" : "",
  };
}

/** The UTM tags back as a query string, for HubSpot's pageUri. "" when there are none. */
export function attributionQuery(a: BriefAttribution): string {
  const params = new URLSearchParams();
  for (const [field, key] of Object.entries(UTM_KEYS)) {
    const value = a[field as keyof typeof UTM_KEYS];
    if (value) params.set(key, value);
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}

/**
 * The attribution as labelled lines, for the internal email and HubSpot's
 * `message`. NOT part of briefLines: that also renders the customer's own
 * receipt, and "utm_medium: paid_social" has no business in it.
 */
export function attributionLines(a: BriefAttribution): [string, string][] {
  const rows: [string, string][] = [
    ["Source", [a.source, a.medium].filter(Boolean).join(" / ")],
    ["Campaign", a.campaign],
    ["Ad", a.content],
    ["Keyword", a.term],
    ["Ad click", a.clickFrom],
  ];
  return rows.filter(([, value]) => value !== "");
}

/**
 * The brief as one plain-text block, for HubSpot's `message` field.
 *
 * Plain text, not HTML: this lands in a CRM textarea a salesperson reads, and
 * HubSpot does not render markup there.
 */
export function briefSummary(
  brief: FitoutBrief,
  attachments: BriefAttachment[] = [],
  attribution?: BriefAttribution
): string {
  const text = (rows: [string, string][]) =>
    rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const body = text(briefLines(brief, attachments));
  const from = attribution ? text(attributionLines(attribution)) : "";
  // Its own paragraph, after the brief: the brief is what the customer said,
  // this is what we know about how they arrived.
  return from ? `${body}\n\n${from}` : body;
}

/**
 * The HubSpot field list. ONLY the seven properties the portal already defines -
 * see the note at the top of this file before adding to it.
 */
export function briefHubspotFields(
  brief: FitoutBrief,
  attachments: BriefAttachment[] = [],
  attribution?: BriefAttribution
): { name: string; value: string }[] {
  return [
    { name: "firstname", value: brief.firstName },
    { name: "lastname", value: brief.lastName },
    { name: "email", value: brief.email },
    { name: "phone", value: brief.phone },
    { name: "company", value: brief.company },
    { name: "enquiry_type", value: portalEnquiryType(ENQUIRY_KIND.fitout) },
    // MQL on arrival. A completed brief is not a newsletter signup: someone has
    // named their space, its dimensions, a budget band and a timeline, which is
    // more qualification than most outbound ever produces.
    //
    // `marketingqualifiedlead` is HubSpot's INTERNAL value, read off the
    // lifecyclestage property definition rather than guessed - "MQL" is the label
    // and would be silently discarded, exactly as every enquiry_type value was
    // before 17 September.
    //
    // ONLY THE BRIEF. This field lives in briefHubspotFields, which nothing but
    // /api/fitout-brief calls, so a newsletter signup or a warranty claim is
    // unaffected.
    { name: "lifecyclestage", value: "marketingqualifiedlead" },
    { name: "message", value: briefSummary(brief, attachments, attribution) },
  ];
}
