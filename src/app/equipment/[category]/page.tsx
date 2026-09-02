import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHero from "@/components/marketing/PageHero";
import ProductListing from "@/components/shop/ProductListing";
import SortSelect from "@/components/shop/SortSelect";
import PriceRangeFilter from "@/components/shop/PriceRangeFilter";
import { categories, getCategory } from "@/lib/categories";
import {
  getAllProductsByCategory,
  getCategoryDescription,
  type WcProduct,
  type WcCategoryChild,
} from "@/lib/woocommerce";
import { getUnleashedMap, enrichCard, type EnrichedProduct } from "@/lib/unleashed";
import { erpSubgroups, erpUnitsInGroup, unitCard } from "@/lib/erp-catalogue";

export function generateStaticParams() {
  return categories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const c = getCategory(category);
  if (!c) return { title: "Equipment" };
  return {
    title: `${c.label}`,
    description: c.blurb,
    alternates: { canonical: `/equipment/${c.slug}` },
  };
}

const PER_PAGE = 24;

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string; sort?: string; sub?: string; min?: string; max?: string }>;
}) {
  const { category } = await params;
  const c = getCategory(category);
  if (!c) notFound();

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const sort = sp.sort ?? "featured";
  const subSlug = sp.sub;
  const priceMin = sp.min && !isNaN(parseFloat(sp.min)) ? parseFloat(sp.min) : undefined;
  const priceMax = sp.max && !isNaN(parseFloat(sp.max)) ? parseFloat(sp.max) : undefined;

  // MEMBERSHIP COMES FROM THE ERP. `erpGroup` is the category; a product is here
  // because Unleashed files it here. The WooCommerce term is still read for the
  // SEO copy the snapshot holds, and as the fallback below.
  const [unleashed, categoryDescription] = await Promise.all([
    getUnleashedMap().catch(() => ({})),
    c.wcId ? getCategoryDescription(c.wcId).catch(() => "") : "",
  ]);

  // Sub-filters are ProductSubGroup — "Dumbbells", "Barbells", "Wall Mounted" —
  // which is both richer and better maintained than the WooCommerce child terms
  // it replaces.
  const children: WcCategoryChild[] = c.erpGroup
    ? erpSubgroups(unleashed, c.erpGroup).map((s, i) => ({ id: i + 1, ...s }))
    : [];
  const activeSub = subSlug ? children.find((s) => s.slug === subSlug) : undefined;

  let cards: { product: WcProduct; enriched: EnrichedProduct }[] = [];
  let total = 0;
  let totalPages = 1;
  let failed = false;

  const priceSort = sort === "price-asc" || sort === "price-desc";

  try {
    {
      let enrichedAll: { product: WcProduct; enriched: EnrichedProduct }[];

      // CLEARANCE IS THE CARVE-OUT, and so is an unreachable ERP. Clearance is
      // ex-display stock on A-prefixed codes that Unleashed does not group, so
      // it keeps listing from the snapshot with the brand filter off. And if the
      // ERP map came back empty — the API is down, or throttling — every category
      // falls back to the snapshot rather than telling a visitor we sell nothing.
      const erpUsable = !!c.erpGroup && Object.keys(unleashed).length > 0;
      if (erpUsable) {
        let units = erpUnitsInGroup(unleashed, c.erpGroup!);
        if (activeSub) units = units.filter((u) => u.subgroup === activeSub.name);
        enrichedAll = units.map(unitCard);
      } else {
        const all = !c.wcId
          ? []
          : await getAllProductsByCategory(c.wcId, { brandFilter: c.slug !== "clearance" });
        enrichedAll = await Promise.all(
          all.map(async (product) => ({ product, enriched: await enrichCard(product, unleashed) }))
        );
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
    }
  } catch {
    failed = true;
  }

  const buildHref = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const sub = patch.sub === undefined ? subSlug : patch.sub || undefined;
    const s = patch.sort === undefined ? (sort !== "featured" ? sort : undefined) : patch.sort;
    const pg = patch.page;
    if (sub) p.set("sub", sub);
    if (s) p.set("sort", s);
    if (priceMin !== undefined) p.set("min", String(priceMin));
    if (priceMax !== undefined) p.set("max", String(priceMax));
    if (pg) p.set("page", pg);
    const qs = p.toString();
    return `/equipment/${c.slug}${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHero
        eyebrow="Equipment"
        title={c.label}
        subtitle={c.blurb}
        image={c.image}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Equipment", href: "/all-equipment" },
          { name: c.label, href: `/equipment/${c.slug}` },
        ]}
      />

      <section className="container-mk py-16">
        {failed ? (
          <Fallback label={c.label} />
        ) : (
          <>
            {/* Filter + sort bar */}
            <div className="mb-10 space-y-4">
              {children.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={buildHref({ sub: "", page: undefined })}
                    className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest border transition-colors ${
                      !activeSub ? "border-accent text-accent-600" : "border-line text-ash hover:border-ash"
                    }`}
                  >
                    All
                  </Link>
                  {children.map((s) => (
                    <Link
                      key={s.id}
                      href={buildHref({ sub: s.slug, page: undefined })}
                      className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest border transition-colors ${
                        activeSub?.id === s.id ? "border-accent text-accent-600" : "border-line text-ash hover:border-ash"
                      }`}
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

            {categoryDescription && (
              <div className="mt-16 pt-10 border-t border-line max-w-3xl">
                <h2 className="text-xl font-bold mb-5">About {c.label}</h2>
                <div
                  className="text-ash leading-relaxed [&_p]:mb-4 [&_strong]:text-ink [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-accent-600 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: categoryDescription }}
                />
              </div>
            )}
          </>
        )}
      </section>
    </>
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
