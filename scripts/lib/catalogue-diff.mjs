// Comparing a fresh WooCommerce read against the committed snapshot.
//
// Extracted from build-catalogue.mjs so the comparison rules can be tested
// without a store to fetch from. The script owns the fetching and the writing;
// this file owns the question "is this product different, and in what".

// WooCommerce does not promise a stable order for a product's `categories`, and
// it demonstrably reshuffles it for products nobody has edited: on 28 August six
// rigs came back with the same four terms in a different order, which a
// whole-object JSON compare reported as drift. That is the gate crying wolf, and
// a gate that cries wolf gets skipped.
//
// The site depends on exactly one thing about that order: product/[slug] takes
// `categories[0]` as the breadcrumb. So compare position 0 exactly and the rest
// as a set. Sorting the whole array instead would hide a changed breadcrumb;
// comparing the whole array in order fails the build over a reshuffle that
// changes nothing on any page.
//
// Only the comparison normalises. What gets WRITTEN stays in the store's own
// order, because that is what `categories[0]` reads.
export function normaliseCategories(product) {
  const [primary, ...rest] = product.categories ?? [];
  return [primary ?? null, ...rest.map((c) => JSON.stringify(c)).sort()];
}

export function comparable(product) {
  return JSON.stringify({ ...product, categories: normaliseCategories(product) });
}

/**
 * The FIELD NAMES that differ between two versions of one product.
 *
 * The gate used to print a slug and a SKU and nothing else, so a failure said
 * "218 changed" and left the reader to guess whether that was a price edit, a
 * plugin rewriting descriptions, or the store having a bad minute. Naming the
 * fields is the difference between a gate you can act on and one you re-run
 * until it goes green.
 */
export function changedFields(was, now) {
  const out = [];
  const keys = new Set([...Object.keys(was ?? {}), ...Object.keys(now ?? {})]);
  for (const key of keys) {
    const a = key === "categories" ? normaliseCategories(was) : was?.[key];
    const b = key === "categories" ? normaliseCategories(now) : now?.[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(key);
  }
  return out.sort();
}

/** Snapshot vs store, keyed by slug. */
export function diffCatalogue(previous, current) {
  const was = new Map((previous ?? []).map((p) => [p.slug, p]));
  const now = new Map((current ?? []).map((p) => [p.slug, p]));
  return {
    added: (current ?? []).filter((p) => !was.has(p.slug)),
    removed: (previous ?? []).filter((p) => !now.has(p.slug)),
    changed: (current ?? [])
      .filter((p) => was.has(p.slug) && comparable(was.get(p.slug)) !== comparable(p))
      .map((p) => ({ ...p, _fields: changedFields(was.get(p.slug), p) })),
  };
}

/**
 * The drift that TWO reads agree on.
 *
 * On 18 September the gate reported "0 added, 0 removed, 218 changed" against an
 * unchanged snapshot and an unchanged repo, then passed on the next run a minute
 * later with the same inputs. Two full reads taken immediately afterwards were
 * byte-identical to each other, so whatever the store served during that minute
 * was not what it holds — and the deploy it blocked was correct.
 *
 * A gate that fails at random on a correct deploy is worse than no gate: it
 * teaches whoever hits it to re-run until green, which is also what they would
 * do if the drift were real. So drift now has to REPRODUCE before it fails the
 * build. A genuine edit in WordPress is still there on the second read; a store
 * having a bad minute is not.
 *
 * This deliberately does not retry the SHORT-READ guard in build-catalogue.mjs.
 * That one refuses to write and is about losing data, not about crying wolf.
 */
export function confirmedDrift(first, second) {
  const slugs = (list) => new Set(list.map((p) => p.slug));
  const [a2, r2, c2] = [slugs(second.added), slugs(second.removed), slugs(second.changed)];
  return {
    added: first.added.filter((p) => a2.has(p.slug)),
    removed: first.removed.filter((p) => r2.has(p.slug)),
    changed: first.changed.filter((p) => c2.has(p.slug)),
  };
}

export const driftCount = (d) => d.added.length + d.removed.length + d.changed.length;
