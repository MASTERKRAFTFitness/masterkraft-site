// The words for a product, read from Supabase, preferred over the frozen copy.
//
// SERVER ONLY, like product-gallery and admin-db: the service role key, against
// a table with RLS on and no policies.
//
// This is the read path product_content has been waiting for since it was loaded
// on 5 September. It follows lib/product-gallery.ts deliberately — same caching,
// same fail-soft — because that file was written as the pattern for this one.
//
// ONLY HUMAN-EDITED ROWS WIN, and that is the whole design.
//
// `content.load` populated 404 of ~512 rows FROM the frozen snapshot. Those rows
// are the snapshot, copied. Preferring one over the snapshot is a no-op when the
// load was faithful and a silent regression when it was not, so there is nothing
// to gain by reading them and a page of wrong copy to lose. Worse, several of
// those slugs have since been improved by hand in src/data/product-copy.json —
// the Core Trainer and Rope & Band Rack pairs, among others — so preferring a
// loader-owned row would quietly reinstate the duplicate descriptions that file
// exists to fix.
//
// So a row only speaks when a person has changed it. `content.load` stamps
// `updated_by` with its own name; anything else means somebody edited it, and
// that edit is the most recent statement of what the page should say. This is
// also the point of the table: that somebody other than an engineer can change
// the words without a deploy.
//
// A NULL `updated_by` counts as human. The loader always stamps its name, so a
// row without one was written by something else — a person in the SQL editor,
// most likely — and the safe reading of "not the loader" is "not the frozen
// original".
//
// PRECEDENCE, highest first:
//
//   1. a human-edited product_content row   — here
//   2. src/data/product-copy.json           — authored, deploy-time
//   3. the frozen WooCommerce snapshot      — whatever the page already had
//
// Dropping from 1 to 2 to 3 is what makes this safe to ship: an empty table, an
// outage, or missing credentials all land on exactly today's behaviour.
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/admin-db";
import { productCopy, productCopyHtml } from "@/lib/product-copy";
import { SPEC_FIELDS, type SpecLabel } from "@/lib/spec";

/** The loader's signature in `updated_by`. Must match scripts/content.load.ts. */
const LOADER = "content.load";

/** An edited spec value per label. Absent labels fall through to the snapshot. */
export type SpecOverride = Partial<Record<SpecLabel, string>>;

/** What a page needs: the meta sentence, the Product Overview as HTML, the specs. */
export type ContentEntry = { short?: string; html?: string; specs?: SpecOverride };

/** Human-edited copy, keyed by SLUG — which is what the page and the URL have. */
export type ContentMap = Record<string, ContentEntry>;

/**
 * The body a row renders as.
 *
 * `overview` is already HTML: content.load takes it from parseProductDetail's
 * overviewDescription, which is WooCommerce meta. `features` is a text[]. They
 * are assembled in the same shape productCopyHtml produces from the JSON, so a
 * page cannot tell which source it got.
 */
function htmlFrom(overview: string | null, features: string[]): string | undefined {
  const body = (overview ?? "").trim();
  const list = features.filter((f) => typeof f === "string" && f.trim());
  if (!body && !list.length) return undefined;
  const bullets = list.length
    ? `<h3>Features</h3><ul>${list.map((f) => `<li>${f}</li>`).join("")}</ul>`
    : "";
  return body + bullets;
}

async function buildContent(): Promise<ContentMap> {
  const db = adminDb();
  // Unconfigured is not an error. Report scripts and local checkouts run without
  // Supabase credentials, and the site served this copy from the snapshot alone
  // until now.
  if (!db) return {};

  // The whole table, filtered in JS rather than with .neq(). A Postgres `neq`
  // drops NULLs, which would silently discard exactly the rows this is most
  // careful to honour — a person's edit that left no name. 404 rows is one small
  // read an hour; there is nothing to optimise here.
  // A LITERAL select string, not one built from SPEC_FIELDS. supabase-js infers
  // the row type from this string, and a computed one collapses `data` to
  // GenericStringError[] — every field access below becomes a type error. The
  // seven spec columns are spelled out here and paired with their labels in
  // SPEC_FIELDS; the pairing is what the loader and the resolver share.
  const { data, error } = await db
    .from("product_content")
    .select("slug, overview_short, overview, features, updated_by, assembled_size, colour, material, net_weight, gross_weight, packing_size, warranty");
  if (error) throw new Error(`product_content: ${error.message}`);

  const out: ContentMap = {};
  for (const row of data ?? []) {
    if (row.updated_by === LOADER) continue; // the frozen snapshot, copied
    const slug = String(row.slug ?? "").trim();
    if (!slug) continue; // keyed by erp_code; without a slug no page can find it

    const short = String(row.overview_short ?? "").trim() || undefined;
    const html = htmlFrom(row.overview ?? null, (row.features ?? []) as string[]);

    // Specs, field by field. An empty column is not an override — it means the
    // editor did not touch that row of the table, so the snapshot's value
    // stands. Blanking a spec deliberately is not expressible here, and that is
    // the right trade: the failure of a missing override is a stale value, the
    // failure of an accidental one is a spec table that silently loses rows.
    const specs: SpecOverride = {};
    for (const [label, col] of SPEC_FIELDS) {
      const v = String((row as unknown as Record<string, unknown>)[col] ?? "").trim();
      if (v) specs[label] = v;
    }
    const hasSpecs = Object.keys(specs).length > 0;

    // A row that sets nothing is not an override of anything. Skipping it keeps
    // "has an entry" meaning "has something to say", so a caller can test the
    // entry rather than each of its fields.
    if (!short && !html && !hasSpecs) continue;

    out[slug] = {
      ...(short ? { short } : {}),
      ...(html ? { html } : {}),
      ...(hasSpecs ? { specs } : {}),
    };
  }
  return out;
}

// An hour, matching the ERP map and the gallery. Copy changes far less often
// than stock, and an editor who wants their change now can wait the hour or the
// tag can be revalidated.
//
// VERSION THE KEY when the shape or meaning of a value changes: a warm cache
// serves the old answer for the full hour, and the fix looks like it did not
// deploy.
const cachedContent = unstable_cache(buildContent, ["product-content-v1"], {
  revalidate: 3600,
  tags: ["product-content"],
});

/**
 * Human-edited copy by slug. Empty on any failure.
 *
 * FAILS SOFT ON PURPOSE, and it can afford to: every caller already has copy
 * from the JSON or the snapshot, so an outage here costs an editor's change,
 * never the page.
 */
export async function getProductContent(): Promise<ContentMap> {
  try {
    return await cachedContent();
  } catch (e) {
    console.error("[product-content] read failed", e);
    return {};
  }
}

/**
 * The copy a slug should render, database first.
 *
 * FIELD BY FIELD, not wholesale — the same rule product-copy.json already
 * follows against the snapshot. A row may carry only a meta sentence, and
 * replacing a good body with nothing because the short was edited is how an
 * override loses content it was never asked to touch.
 *
 * Pass the map from getProductContent(); `{}` gives exactly today's behaviour,
 * which is what makes this safe to call before the table has anything in it.
 */
export function resolveCopy(slug: string, content: ContentMap = {}): ContentEntry {
  const row = content[slug];
  const json = productCopy(slug);
  return {
    short: row?.short ?? json?.short,
    html: row?.html ?? productCopyHtml(slug),
  };
}

/**
 * The spec table a slug should render, database first.
 *
 * FIELD BY FIELD, like resolveCopy. An editor who corrects one warranty gets
 * their warranty and the snapshot's other six rows, not a table with one line.
 *
 * Pass the map from getProductContent(); `{}` returns `fallback` untouched,
 * which is what makes this safe to call before the columns have anything in
 * them — and is the path every product takes until somebody edits one.
 */
export function resolveSpecs(
  slug: string,
  fallback: { label: string; value: string }[],
  content: ContentMap = {}
): { label: string; value: string }[] {
  const override = content[slug]?.specs;
  // No edited row: hand back exactly what the snapshot produced, same array,
  // same order. This is the path every product takes until somebody edits one.
  if (!override) return fallback;

  const from = new Map(fallback.map((s) => [s.label, s.value]));
  const out: { label: string; value: string }[] = [];
  // SPEC_FIELDS order, not the fallback's, so a spec the snapshot never had —
  // the Functional Trainer's missing Packing size, say — lands in its proper
  // place in the table rather than appended after Warranty.
  for (const [label] of SPEC_FIELDS) {
    const value = override[label] ?? from.get(label);
    if (value) out.push({ label, value });
  }
  return out;
}
