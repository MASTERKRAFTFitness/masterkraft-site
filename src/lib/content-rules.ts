// The house style, as checks rather than as a document.
//
// EVERY RULE HERE EXISTS BECAUSE IT WAS BROKEN. On 23 September 2026 the blog
// carried "Fit-Out" in three post titles, three slugs and six bodies — after a
// commit in August had already corrected exactly that. Every image's alt text
// described the prompt that generated it and truncated mid-word. One post
// published a $150,000-$300,000 startup range under the MD's byline with no
// source. None of that needed judgement to spot; it needed somebody to look,
// and nobody had a way to look at forty thousand words on a schedule.
//
// A CONVENTION IN A DOCUMENT GETS BROKEN AGAIN. The spelling rule has been
// written down twice — in the Opinly brand-voice field and in the campaigns
// repo — and came back both times. This file is the third attempt and the
// first one a machine can enforce.
//
// PURE, AND DELIBERATELY SO. No fetching, no file writing, no environment. The
// report script supplies posts and decides what to do with findings; this
// module only says what is wrong. That is what lets `npm test` cover it
// offline, and what would let a portal or a webhook reuse it unchanged.
//
// THE FIGURE RULE READS lib/usps.ts RATHER THAN A COPY. 229 sites, 12
// countries and the 72-hour SLA are the site's numbers; if the site changes
// them and this file held its own list, the linter would start flagging the
// truth. Importing is what keeps the two honest.
import { stats } from "@/lib/usps";
import { TITLE_MAX, renderedLength } from "@/lib/page-title";

export type Severity = "error" | "warn";

export type Finding = {
  /** Stable id, so a report can be diffed between runs. */
  rule: string;
  severity: Severity;
  /** Which part of the post: title, slug, body, image.alt, ... */
  field: string;
  /** What is wrong, in a sentence somebody can act on. */
  detail: string;
};

/** The shape a post needs to be lintable. Deliberately narrower than Opinly's. */
export type LintablePost = {
  slug: string;
  title: string;
  metaTitle?: string | null;
  description?: string | null;
  content?: string | null;
  image?: { alt?: string | null; title?: string | null } | null;
};

/**
 * Figures the site already states about itself, so a post may state them too.
 *
 * Derived from `stats`, not retyped: "72hr" contributes 72, "229" contributes
 * 229. Anything else with a currency sign or a percent sign is something a
 * post invented, and a human decides whether it is sourced.
 */
const APPROVED_FIGURES = new Set(
  stats.flatMap((s) => s.value.match(/\d+/g) ?? [])
);

/**
 * -ize spellings worth flagging, as stems rather than a pattern.
 *
 * `\w+ize` would catch "size", "prize" and "capsize", and a rule that cries
 * wolf is a rule people learn to ignore. This list is the words that actually
 * turn up in commercial copy; "standardized" is in the 2 October post today.
 */
const IZE_STEMS = [
  "organi", "optimi", "standardi", "speciali", "reali", "recogni", "utili",
  "customi", "maximi", "minimi", "prioriti", "categori", "normali", "moderni",
];
// Only the `z` form. An earlier version allowed `(z|s)` and so flagged
// "optimised" and "selectorised" — the correct spellings — which is the fastest
// way to get a linter turned off. Caught by its own test.
const IZE = new RegExp(`\\b(${IZE_STEMS.join("|")})z(e|ed|es|ing|ation)\\b`, "gi");

// Currency, percentages, and thousands-separated counts.
//
// DELIBERATELY NARROW. "ISO 20957", "11-gauge", "24/7", "2026" and "Class S"
// are not claims about the business, and a linter that flags them is one people
// switch off. Requiring a currency sign, a percent sign or a thousands
// separator keeps precision high.
//
// THE SEPARATOR CASE IS THE CARELOCATE ONE. The figure that reached seven
// published posts, a meta description and the JSON-LD was "30,000+" — no
// currency, no percent, just a comma and a plus. A rule that only looked at
// money would have missed the incident that caused this rule to exist.
const CURRENCY = /\$\s?\d[\d,]*(?:\.\d+)?\s?[km]?\b/gi;
const PERCENT = /\b\d+(?:\.\d+)?\s?%/g;
const BIG_COUNT = /\b\d{1,3}(?:,\d{3})+\+?/g;

/** Generated-header boilerplate, as it actually appears. */
const ALT_BOILERPLATE = /^\s*professional\s+header\s+image\s+for\b/i;
/** Alt text cut off by a fixed character budget. */
const ALT_TRUNCATED = /(\.\.\.|…)\s*$/;

/** Where common screen readers begin to cut. */
export const ALT_MAX = 125;
/** Where a search snippet begins to cut. */
export const DESCRIPTION_MAX = 155;

const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * Every rule, applied to one post.
 *
 * Severity is a claim about certainty, not importance. `error` means the rule
 * cannot be wrong — a hyphen is a hyphen. `warn` means a human has to look:
 * an unapproved figure may be perfectly well sourced, and the linter has no
 * way to know.
 */
export function lintPost(post: LintablePost): Finding[] {
  const findings: Finding[] = [];
  const add = (rule: string, severity: Severity, field: string, detail: string) =>
    findings.push({ rule, severity, field, detail });

  const textFields: [string, string][] = [
    ["title", post.title ?? ""],
    ["slug", post.slug ?? ""],
    ["metaTitle", post.metaTitle ?? ""],
    ["description", post.description ?? ""],
    ["content", post.content ?? ""],
  ];

  // 1. FITOUT IS ONE WORD. The site spells it that way everywhere; three post
  // titles and six bodies did not. "Fitting out" is a verb and is left alone —
  // the hyphen is what makes this unambiguous.
  for (const [field, text] of textFields) {
    const hits = text.match(/\bfit-outs?\b/gi);
    if (hits?.length) {
      add(
        "spelling/fitout",
        "error",
        field,
        `${hits.length} × "${uniq(hits)[0]}" — the site spells it "fitout", one word`
      );
    }
  }

  // 2. AUSTRALIAN ENGLISH.
  for (const [field, text] of textFields) {
    const hits = text.match(IZE);
    if (hits?.length) {
      add(
        "spelling/au-english",
        "warn",
        field,
        `${uniq(hits).join(", ")} — Australian English uses -ise`
      );
    }
  }

  // 3. FIGURES THE POST INVENTED.
  //
  // This is the rule that would have caught the $150,000-$300,000 startup
  // range and the two budget tables in the cost-to-open post. It cannot tell a
  // sourced figure from an unsourced one, and does not try: it surfaces every
  // money and percentage claim that is not one of the site's own, and a human
  // says whether it holds up. Under-flagging would defeat the point.
  for (const [field, text] of textFields) {
    if (field === "slug") continue;
    const figures = uniq([
      ...(text.match(CURRENCY) ?? []),
      ...(text.match(PERCENT) ?? []),
      ...(text.match(BIG_COUNT) ?? []),
    ])
      .filter((f) => !(f.match(/\d+/g) ?? []).every((n) => APPROVED_FIGURES.has(n)));
    if (figures.length) {
      add(
        "figures/unapproved",
        "warn",
        field,
        `${figures.length} figure(s) not stated by the site: ${figures.slice(0, 6).join(", ")}${figures.length > 6 ? " …" : ""} — confirm each is sourced`
      );
    }
  }

  // 4. IMAGE METADATA.
  const alt = post.image?.alt ?? "";
  const imgTitle = post.image?.title ?? "";
  if (ALT_BOILERPLATE.test(alt)) {
    add(
      "image/alt-boilerplate",
      "error",
      "image.alt",
      "alt text describes the generation prompt, not the image"
    );
  }
  if (ALT_TRUNCATED.test(alt)) {
    add("image/alt-truncated", "error", "image.alt", "alt text is cut off mid-sentence");
  }
  if (alt.length > ALT_MAX) {
    add(
      "image/alt-too-long",
      "warn",
      "image.alt",
      `${alt.length} characters — screen readers cut around ${ALT_MAX}`
    );
  }
  if (imgTitle.trim()) {
    add(
      "image/title-not-empty",
      "warn",
      "image.title",
      "the image title field should be empty — it renders as a tooltip and reads as keyword stuffing"
    );
  }

  // 5. SEO LENGTHS, against the site's own limit rather than a second opinion.
  if (post.metaTitle && renderedLength(post.metaTitle) > TITLE_MAX) {
    add(
      "seo/meta-title-length",
      "warn",
      "metaTitle",
      `${renderedLength(post.metaTitle)} > ${TITLE_MAX} — the end will be cut in a search result`
    );
  }
  if (post.description && post.description.length > DESCRIPTION_MAX) {
    add(
      "seo/description-length",
      "warn",
      "description",
      `${post.description.length} > ${DESCRIPTION_MAX} characters`
    );
  }

  return findings;
}

/** Findings for many posts, flattened with the post each came from. */
export function lintPosts(posts: LintablePost[]): { post: LintablePost; findings: Finding[] }[] {
  return posts.map((post) => ({ post, findings: lintPost(post) }));
}
