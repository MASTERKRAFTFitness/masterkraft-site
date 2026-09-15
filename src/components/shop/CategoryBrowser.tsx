// The equipment listing itself: filters, grid, pagination, ItemList and the
// prose under it.
//
// SHARED BY TWO ROUTES ON PURPOSE. /equipment/<category> and
// /equipment/<category>/<subcategory> show the same catalogue through a
// different window, and the moment they are two implementations they start
// disagreeing about sort order, page size or what an empty result looks like.
// Everything that differs between them is a prop; everything that does not
// lives here once.
//
// The HERO and the BreadcrumbList stay in the pages. They are the part that is
// genuinely different — a subcategory has one more crumb and its own H1 — and
// pushing them in here would mean passing the whole page down as props.
import Link from "next/link";
import JsonLd from "@/components/seo/JsonLd";
import ProductListing from "@/components/shop/ProductListing";
import SortSelect from "@/components/shop/SortSelect";
import PriceRangeFilter from "@/components/shop/PriceRangeFilter";
import type { Category } from "@/lib/categories";
import { subcategoriesOf } from "@/lib/subcategories";
import { SITE_URL } from "@/lib/site";
import {
  getAllProductsByCategory,
  getCategoryDescription,
  type WcProduct,
} from "@/lib/woocommerce";
import { getUnleashedMap, enrichCard, type EnrichedProduct } from "@/lib/unleashed";
import { CLEARANCE_GROUP, erpSubgroups, erpUnitsInGroup, unitCard } from "@/lib/erp-catalogue";

export const PER_PAGE = 24;

export type BrowserSearchParams = {
  page?: string;
  sort?: string;
  sub?: string;
  min?: string;
  max?: string;
};

export default async function CategoryBrowser({
  category: c,
  subgroup,
  basePath,
  listName,
  aboutHeading,
  about,
  searchParams: sp,
}: {
  category: Category;
  /** The ERP ProductSubGroup this view is pinned to, if any. */
  subgroup?: string;
  /** Where this view's own links point: the category or the subcategory URL. */
  basePath: string;
  /** The ItemList's name. */
  listName: string;
  /** What "About …" names. The label, not the schema name. */
  aboutHeading: string;
  /** Prose under the grid. A subcategory brings its own; a category's comes
   *  from the WooCommerce snapshot, or from `about` where it has none. */
  about?: string;
  searchParams: BrowserSearchParams;
}) {
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const sort = sp.sort ?? "featured";
  const priceMin = sp.min && !isNaN(parseFloat(sp.min)) ? parseFloat(sp.min) : undefined;
  const priceMax = sp.max && !isNaN(parseFloat(sp.max)) ? parseFloat(sp.max) : undefined;

  // MEMBERSHIP COMES FROM THE ERP. `erpGroup` is the category; a product is here
  // because Unleashed files it here. The WooCommerce term is still read for the
  // SEO copy the snapshot holds, and as the fallback below.
  const [unleashed, snapshotCopy] = await Promise.all([
    getUnleashedMap().catch(() => ({})),
    c.wcId && !subgroup ? getCategoryDescription(c.wcId).catch(() => "") : "",
  ]);

  // THE FACET BAR IS STILL THE ERP'S SUBGROUPS, not the written subcategories —
  // a filter for something with no page is still a useful filter, and dropping
  // it would hide products to tidy up a nav. The ones that HAVE a page link to
  // it; the rest stay as `?sub=`, which is what they are.
  const written = new Map(subcategoriesOf(c.slug).map((s) => [s.erpSubgroup, s]));
  const facets = (c.erpGroup ? erpSubgroups(unleashed, c.erpGroup) : []).map((s) => ({
    ...s,
    href: written.has(s.name) ? `/equipment/${c.slug}/${written.get(s.name)!.slug}` : undefined,
  }));
  const activeFacet = subgroup ? facets.find((f) => f.name === subgroup) : undefined;
  // A `?sub=` that is not a written page still filters, exactly as before.
  const querySub = !subgroup && sp.sub ? facets.find((f) => f.slug === sp.sub) : undefined;
  const activeName = subgroup ?? querySub?.name;

  let cards: { product: WcProduct; enriched: EnrichedProduct }[] = [];
  let total = 0;
  let totalPages = 1;
  let failed = false;

  const priceSort = sort === "price-asc" || sort === "price-desc";

  try {
    let enrichedAll: { product: WcProduct; enriched: EnrichedProduct }[];

    // CLEARANCE IS THE CARVE-OUT, and so is an unreachable ERP. Clearance is
    // ex-display stock on A-prefixed codes, listed from the snapshot with the
    // brand filter off, because nothing in the ERP marks a product as
    // ex-display. And if the ERP map came back empty — the API is down, or
    // throttling — every category falls back to the snapshot rather than
    // telling a visitor we sell nothing.
    const erpUsable = !!c.erpGroup && Object.keys(unleashed).length > 0;
    if (erpUsable) {
      let units = erpUnitsInGroup(unleashed, c.erpGroup!);
      if (activeName) units = units.filter((u) => u.subgroup === activeName);
      enrichedAll = units.map(unitCard);
    } else {
      const all = !c.wcId
        ? []
        : await getAllProductsByCategory(c.wcId, { brandFilter: c.slug !== "clearance" });
      enrichedAll = await Promise.all(
        all.map(async (product) => ({ product, enriched: await enrichCard(product, unleashed) }))
      );

      // AND THE ERP'S OWN CLEARANCE GROUP, WHICH IS A SECOND SET (2026-09-07).
      // Unleashed groups six products under "Clearance" and they are not the
      // 35 the snapshot lists — zero overlap, different codes, different
      // brands. They were sellable stock that no page offered, so they are
      // APPENDED here rather than replacing anything.
      if (c.slug === "clearance") {
        enrichedAll = [...enrichedAll, ...erpUnitsInGroup(unleashed, CLEARANCE_GROUP).map(unitCard)];
      }
    }

    if (priceMin !== undefined) {
      enrichedAll = enrichedAll.filter((x) => x.enriched.priceValue >= priceMin);
    }
    if (priceMax !== undefined) {
      enrichedAll = enrichedAll.filter(
        (x) => x.enriched.priceValue > 0 && x.enriched.priceValue <= priceMax
      );
    }
    if (priceSort) {
      enrichedAll.sort((a, b) => {
        const av = a.enriched.priceValue;
        const bv = b.enriched.priceValue;
        if (av === 0 && bv === 0) return 0;
        if (av === 0) return 1; // POA always last
        if (bv === 0) return -1;
        return sort === "price-asc" ? av - bv : bv - av;
      });
    } else if (sort === "name-asc" || sort === "name-desc") {
      enrichedAll.sort((a, b) =>
        sort === "name-asc"
          ? a.product.name.localeCompare(b.product.name)
          : b.product.name.localeCompare(a.product.name)
      );
    }
    total = enrichedAll.length;
    totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    cards = enrichedAll.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  } catch {
    failed = true;
  }

  // THE PRODUCTS ON THIS PAGE, AS STRUCTURED DATA. A listing page had only a
  // BreadcrumbList, so the one thing it is actually for — being a list of
  // products — was the one thing it did not say.
  //
  // It describes THIS page and no other: the slice, in the order rendered, with
  // positions offset by the page number, so page 2 starts at 25 rather than
  // claiming to be the first 24 products again. Names and URLs only; the prices
  // and availability live on each product's own Product schema, and repeating
  // them here would be two places to disagree.
  const itemListSchema = cards.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: listName,
        numberOfItems: total,
        itemListElement: cards.map(({ product }, i) => ({
          "@type": "ListItem",
          position: (page - 1) * PER_PAGE + i + 1,
          name: product.name,
          url: `${SITE_URL}/product/${product.slug}`,
        })),
      }
    : null;

  // Sort and price stay query parameters on whatever path this view is at; the
  // subgroup does not, because on a subcategory page it IS the path.
  const buildHref = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const sub = subgroup
      ? undefined
      : patch.sub === undefined
        ? querySub?.slug
        : patch.sub || undefined;
    const s = patch.sort === undefined ? (sort !== "featured" ? sort : undefined) : patch.sort;
    if (sub) p.set("sub", sub);
    if (s) p.set("sort", s);
    if (priceMin !== undefined) p.set("min", String(priceMin));
    if (priceMax !== undefined) p.set("max", String(priceMax));
    if (patch.page) p.set("page", patch.page);
    const qs = p.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const facetClass = (on: boolean) =>
    `px-3 py-1.5 text-xs font-mono uppercase tracking-widest border transition-colors ${
      on ? "border-accent text-accent-600" : "border-line text-ash hover:border-ash"
    }`;

  return (
    <section className="container-mk py-16">
      {itemListSchema && <JsonLd data={itemListSchema} />}
      {failed ? (
        <Fallback label={c.label} />
      ) : (
        <>
          <div className="mb-10 space-y-4">
            {facets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/equipment/${c.slug}`}
                  className={facetClass(!activeName)}
                >
                  All
                </Link>
                {facets.map((s) => (
                  <Link
                    key={s.slug}
                    href={s.href ?? `/equipment/${c.slug}?sub=${s.slug}`}
                    className={facetClass(
                      s.name === (activeFacet?.name ?? querySub?.name)
                    )}
                  >
                    {s.name}
                  </Link>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between border-t border-line pt-4">
              <PriceRangeFilter min={sp.min} max={sp.max} />
              <SortSelect value={sort} />
            </div>
          </div>

          {cards.length === 0 ? (
            <Fallback label={c.label} empty />
          ) : (
            <>
              <ProductListing items={cards} total={total} />

              {totalPages > 1 && (
                <div className="mt-14 flex items-center justify-center gap-4 font-mono text-sm uppercase tracking-widest">
                  {page > 1 ? (
                    <Link href={buildHref({ page: String(page - 1) })} className="btn btn-out !text-ink">
                      ← Prev
                    </Link>
                  ) : (
                    <span className="btn btn-out opacity-60 !text-ink pointer-events-none">← Prev</span>
                  )}
                  <span className="text-ash">Page {page} of {totalPages}</span>
                  {page < totalPages ? (
                    <Link href={buildHref({ page: String(page + 1) })} className="btn btn-out !text-ink">
                      Next →
                    </Link>
                  ) : (
                    <span className="btn btn-out opacity-60 !text-ink pointer-events-none">Next →</span>
                  )}
                </div>
              )}
            </>
          )}

          {/* A category renders the WooCommerce copy the snapshot holds, falling
              back to `about` for the two it has none for (Apparel, Lighting). A
              subcategory has no WooCommerce term at all, so `about` is the only
              source and lib/subcategories requires one. */}
          {(snapshotCopy || about) && (
            <div className="mt-16 pt-10 border-t border-line max-w-3xl">
              <h2 className="text-xl font-bold mb-5">About {aboutHeading}</h2>
              <div
                className="text-ash leading-relaxed [&_p]:mb-4 [&_strong]:text-ink [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-accent-600 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: snapshotCopy || about! }}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Fallback({ label, empty }: { label: string; empty?: boolean }) {
  return (
    <div className="text-center max-w-2xl mx-auto py-8">
      <p className="font-mono text-xs tracking-widest text-accent uppercase">Catalogue</p>
      <h2 className="mt-4 text-2xl font-bold">
        {empty ? `No ${label.toLowerCase()} products to show right now` : "Products are loading"}
      </h2>
      <p className="mt-4 text-ash leading-relaxed">
        Get in touch and we&apos;ll send specs, pricing and availability for the {label.toLowerCase()} range.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Link href="/contact" className="btn btn-accent">
          Enquire <span aria-hidden>→</span>
        </Link>
        <Link href="/all-equipment" className="btn btn-out !text-ink">
          All Equipment
        </Link>
      </div>
    </div>
  );
}
