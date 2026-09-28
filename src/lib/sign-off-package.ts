// The hand-off from "content is ready" to "Steve is looking at it".
//
// THE ORDER IS FIXED AND THIS IS THE FIRST STEP:
//
//   content ready  →  PTCMO website  →  Steve signs off  →  published via Opinly
//
// Opinly is the LAST step. Its `scheduled_review` status is the enforcement
// point and it works — five posts sat correctly held through two scheduled
// slots in September because nobody had signed off. What failed was not the
// gate. It was this step: the pack that Steve needed to approve never reached
// the portal, because a person had to carry it there and did not.
//
// SO THIS BUILDS THE PACKAGE, IT DOES NOT APPROVE ANYTHING. Nothing here
// publishes, releases or decides. It assembles what a reviewer needs and hands
// it over. The decision stays with the person whose name is on the byline.
//
// WHAT APPROVING COMMITS TO IS THE POINT. A list of titles with tick-boxes is
// not a review; it is a formality that produces a tick. Each item here carries
// the lint findings that apply to it, turned into plain statements of what
// saying yes actually means — "publishes 14 figures the site does not state"
// rather than a rule id. That paragraph used to be written by hand, once, for
// one week's posts. This is that, generated.
//
// PURE, LIKE content-rules. No fetching, no files, no environment, so the
// shape can be tested offline and the transport can be anything: a JSON POST
// to the portal, a file committed to a repo, or a human reading the markdown.
import { lintPost, type Finding, type LintablePost } from "@/lib/content-rules";

/** What a post is doing right now, in Opinly's vocabulary. */
export type PostStatus =
  | "draft"
  | "scheduled"
  | "scheduled_review"
  | "published"
  | "sync_failed";

export type SignOffInput = LintablePost & {
  id: string;
  status: PostStatus;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  author?: string | null;
};

export type SignOffItem = {
  id: string;
  title: string;
  slug: string;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  author: string | null;
  /** Plain statements of what approving this commits to. */
  commitsTo: string[];
  /** Everything the checks found, carried so the reviewer sees the evidence. */
  findings: Finding[];
  /** Whether this post is waiting on sign-off to publish. */
  blocking: boolean;
  /** Set by the portal, never here. */
  decision: null;
};

export type SignOffPackage = {
  generatedAt: string;
  client: string;
  summary: {
    items: number;
    awaitingSignOff: number;
    live: number;
    errors: number;
    warnings: number;
    /** Slots that have passed while held. The cost of the delay, counted. */
    missedSlots: number;
  };
  items: SignOffItem[];
};

/** A post in one of these is waiting on a human before it can publish. */
const AWAITING: PostStatus[] = ["draft", "scheduled_review"];

/**
 * What approving this item actually means, derived rather than asserted.
 *
 * Deliberately blunt. A reviewer skimming twelve items will read this line and
 * nothing else, so it has to carry the thing they would regret not knowing —
 * that the post states money the site has never stated, or that its image is
 * unreadable to a screen reader.
 */
function commitmentsFor(post: SignOffInput, findings: Finding[]): string[] {
  const out: string[] = [];
  const by = (rule: string) => findings.filter((f) => f.rule === rule);

  const figures = by("figures/unapproved");
  if (figures.length) {
    out.push(
      `Publishes figures the site does not state, under ${post.author ?? "the byline"}. ${figures.map((f) => f.detail).join(" ")}`
    );
  }
  if (by("spelling/fitout").length) {
    out.push(
      "Publishes the spelling the site does not use — this has been corrected twice before and returned."
    );
  }
  if (by("spelling/au-english").length) {
    out.push("Contains -ize spellings where the house style is Australian English.");
  }
  if (by("image/alt-boilerplate").length || by("image/alt-truncated").length) {
    out.push(
      "Ships an image whose alt text is unusable — it describes the generation prompt, or stops mid-sentence. A screen reader reads it aloud."
    );
  }
  if (by("image/title-not-empty").length) {
    out.push("Ships a keyword-stuffed image title field.");
  }
  if (by("seo/meta-title-length").length || by("seo/description-length").length) {
    out.push("Has a title or description that search results will cut off.");
  }

  if (!out.length) {
    out.push("Nothing the checks can flag. Approving it is a judgement about the writing.");
  }
  return out;
}

/** True when a scheduled slot has already passed and the post is still held. */
function slotMissed(post: SignOffInput, now: Date): boolean {
  if (!AWAITING.includes(post.status) || !post.scheduledAt) return false;
  return new Date(post.scheduledAt).getTime() < now.getTime();
}

/**
 * The package, ready to hand over.
 *
 * `now` is injected rather than read, so a test can assert on missed slots
 * without depending on the day it runs.
 */
export function buildPackage(
  posts: SignOffInput[],
  opts: { client: string; now?: Date } = { client: "MasterKraft" }
): SignOffPackage {
  const now = opts.now ?? new Date();

  const items: SignOffItem[] = posts.map((post) => {
    const findings = lintPost(post);
    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      status: post.status,
      scheduledAt: post.scheduledAt ?? null,
      publishedAt: post.publishedAt ?? null,
      author: post.author ?? null,
      commitsTo: commitmentsFor(post, findings),
      findings,
      blocking: AWAITING.includes(post.status),
      decision: null,
    };
  });

  // Held first, then soonest-scheduled: the order a reviewer should work in.
  items.sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
    return (a.scheduledAt ?? "9999").localeCompare(b.scheduledAt ?? "9999");
  });

  const all = items.flatMap((i) => i.findings);
  return {
    generatedAt: now.toISOString(),
    client: opts.client,
    summary: {
      items: items.length,
      awaitingSignOff: items.filter((i) => i.blocking).length,
      live: items.filter((i) => i.status === "published").length,
      errors: all.filter((f) => f.severity === "error").length,
      warnings: all.filter((f) => f.severity === "warn").length,
      missedSlots: posts.filter((p) => slotMissed(p, now)).length,
    },
    items,
  };
}

const date = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

/** The same package as something a person can read without a JSON viewer. */
export function renderMarkdown(pkg: SignOffPackage): string {
  const s = pkg.summary;
  const lines: string[] = [
    `# ${pkg.client} — content for sign-off`,
    "",
    `Generated ${pkg.generatedAt.slice(0, 16).replace("T", " ")} UTC.`,
    "",
    `**${s.awaitingSignOff} awaiting sign-off** · ${s.live} live · ${s.errors} errors · ${s.warnings} warnings`,
    "",
  ];

  if (s.missedSlots) {
    lines.push(
      `> ⛔ **${s.missedSlots} scheduled slot${s.missedSlots === 1 ? "" : "s"} already passed** while waiting for sign-off.`,
      "> Those posts need a new date as well as an approval.",
      ""
    );
  }

  lines.push(
    "Nothing here is published. Opinly holds every item below until it is approved,",
    "which is the gate working as intended — this is the step before it.",
    ""
  );

  for (const item of pkg.items) {
    const flag = item.blocking ? "⏳" : "✅";
    lines.push(`## ${flag} ${item.title}`, "");
    lines.push(
      `\`${item.slug}\` · ${item.status}` +
        (item.scheduledAt ? ` · scheduled ${date(item.scheduledAt)}` : "") +
        (item.publishedAt ? ` · published ${date(item.publishedAt)}` : ""),
      ""
    );
    lines.push("**Approving this commits to:**", "");
    for (const c of item.commitsTo) lines.push(`- ${c}`);
    lines.push("");
    if (item.findings.length) {
      lines.push("| | Rule | Field | Detail |", "|---|---|---|---|");
      for (const f of item.findings) {
        lines.push(
          `| ${f.severity === "error" ? "🔴" : "🟡"} | \`${f.rule}\` | \`${f.field}\` | ${f.detail} |`
        );
      }
      lines.push("");
    }
    lines.push("**Decision:** ☐ Approved ☐ Approved with changes ☐ Hold", "", "---", "");
  }

  return lines.join("\n");
}
