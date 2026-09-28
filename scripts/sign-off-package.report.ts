// Assemble the sign-off package and hand it to the PTCMO portal.
//
//   npm run signoff                 writes reports/sign-off-package.{json,md}
//   PTCMO_SIGNOFF_URL=… npm run signoff   also POSTs it to the portal
//
// This is the step that has not been happening. Opinly's `scheduled_review`
// holds content until it is approved, which is correct and works; what failed
// in September was that the material Steve needed never reached him, because a
// person had to carry it and did not. Two scheduled slots passed while a pack
// sat in a repo.
//
// IT DELIVERS, IT DOES NOT APPROVE. Nothing here publishes, releases or
// decides. The POST hands a package to the portal; the decision is made there,
// by the person whose byline is on the posts.
//
// THE POST IS OFF UNLESS CONFIGURED. Without PTCMO_SIGNOFF_URL it writes the
// files and stops, which is what a local run or a fork should do. Sending
// client content to an endpoint is not something to do by default because an
// environment variable happened to be lying around.
//
// THE CONTRACT IS DELIBERATELY SMALL: one POST, JSON body, bearer token. The
// portal needs to accept `SignOffPackage` from lib/sign-off-package and store
// it. Anything more coupled would mean guessing at a schema neither side has
// agreed, and the portal is not visible from here.
//
// WHAT IT CAN SEE, AND WHAT IT CANNOT — the same seam as content-lint.
// @opinly/backend serves PUBLISHED posts only, and the posts that need signing
// off are by definition the ones that have not published. So this runs today
// over live posts, which is useful for catching what is already out, and
// becomes the real thing the moment the management-API credential exists.
// `loadPosts` is the single function to change. See content-lint.report.ts.
//
// Read-only against Opinly. It measures and reports; it changes nothing there.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { createOpinlyClient, type ContentNode } from "@opinly/backend";
import { buildPackage, renderMarkdown, type SignOffInput } from "@/lib/sign-off-package";

const JSON_OUT = "reports/sign-off-package.json";
const MD_OUT = "reports/sign-off-package.md";

/** Environment first, `.env.local` second — CI has no dotfile. */
function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync(".env.local")) return undefined;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

/** Opinly stores bodies as a node tree; the checks want words. */
function textOf(node: ContentNode | undefined): string {
  if (!node) return "";
  return [node.text ?? "", (node.content ?? []).map(textOf).join(" ")]
    .filter(Boolean)
    .join(" ");
}

/** THE SWAP POINT. Management-API read goes here and everything else follows. */
async function loadPosts(apiKey: string): Promise<SignOffInput[]> {
  const client = createOpinlyClient({ apiKey, fetch });

  const summaries: { slug: string; publishedAt?: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.posts({ limit: 50, cursor });
    summaries.push(...page.data.map((p) => ({ slug: p.slug, publishedAt: p.firstPublishedAt })));
    cursor = page.next_cursor ?? undefined;
  } while (cursor);

  const posts: SignOffInput[] = [];
  for (const { slug, publishedAt } of summaries) {
    const full = await client.post(slug);
    if (!full) continue;
    posts.push({
      id: full.slug,
      slug: full.slug,
      title: full.title,
      // Everything this client returns is live by definition.
      status: "published",
      publishedAt: publishedAt ?? full.firstPublishedAt ?? null,
      author: full.author?.name ?? null,
      metaTitle: full.metaTitle,
      description: full.metaDescription ?? full.description,
      content: textOf(full.content),
      image: { alt: full.titleFile?.altText, title: full.titleFile?.title },
    });
  }
  return posts;
}

it("sign-off package", { timeout: 120_000 }, async () => {
  const apiKey = env("OPINLY_API_KEY");
  if (!apiKey) {
    console.log("OPINLY_API_KEY is not set — skipping. Set it to build the package.");
    return;
  }

  const posts = await loadPosts(apiKey);
  const pkg = buildPackage(posts, { client: "MasterKraft" });

  writeFileSync(JSON_OUT, JSON.stringify(pkg, null, 2));
  writeFileSync(MD_OUT, renderMarkdown(pkg));
  console.log(`Wrote ${JSON_OUT} and ${MD_OUT}`);
  console.log(
    `  ${pkg.summary.items} items · ${pkg.summary.awaitingSignOff} awaiting sign-off · ` +
      `${pkg.summary.errors} errors · ${pkg.summary.warnings} warnings · ` +
      `${pkg.summary.missedSlots} slot(s) already passed`
  );

  const url = env("PTCMO_SIGNOFF_URL");
  if (!url) {
    console.log("PTCMO_SIGNOFF_URL is not set — package written, not delivered.");
    return;
  }

  const token = env("PTCMO_SIGNOFF_TOKEN");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(pkg),
  });

  // FAIL LOUDLY. A delivery step that swallows its own failure recreates the
  // problem it exists to fix: everyone assumes Steve has it, and nobody checks.
  if (!res.ok) {
    throw new Error(
      `PTCMO delivery failed: ${res.status} ${res.statusText}. The package is written to ${JSON_OUT}; nothing was delivered.`
    );
  }
  console.log(`Delivered to ${url} (${res.status})`);
});
