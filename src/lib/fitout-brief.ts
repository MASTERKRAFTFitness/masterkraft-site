// The fit-out brief: the shape of what /contact's wizard collects, the options it
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
 * thing that actually changes the build (see FernwoodFeature - their whole range
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
    ["Fit-out type", brief.projectType],
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
 * The brief as one plain-text block, for HubSpot's `message` field.
 *
 * Plain text, not HTML: this lands in a CRM textarea a salesperson reads, and
 * HubSpot does not render markup there.
 */
export function briefSummary(
  brief: FitoutBrief,
  attachments: BriefAttachment[] = []
): string {
  return briefLines(brief, attachments)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

/**
 * The HubSpot field list. ONLY the seven properties the portal already defines -
 * see the note at the top of this file before adding to it.
 */
export function briefHubspotFields(
  brief: FitoutBrief,
  attachments: BriefAttachment[] = []
): { name: string; value: string }[] {
  return [
    { name: "firstname", value: brief.firstName },
    { name: "lastname", value: brief.lastName },
    { name: "email", value: brief.email },
    { name: "phone", value: brief.phone },
    { name: "company", value: brief.company },
    { name: "enquiry_type", value: "A fit-out solution" },
    { name: "message", value: briefSummary(brief, attachments) },
  ];
}
