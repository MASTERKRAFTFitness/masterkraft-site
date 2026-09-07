import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import ProductListing from "@/components/shop/ProductListing";
import SortSelect from "@/components/shop/SortSelect";
import CategoryJumpNav from "@/components/shop/CategoryJumpNav";
import { getAllProducts, type WcProduct } from "@/lib/woocommerce";
import { getUnleashedMap, enrichCard, type EnrichedProduct } from "@/lib/unleashed";
import { erpSubgroups, erpUnits, unitCard, type ErpUnit } from "@/lib/erp-catalogue";
import { categories } from "@/lib/categories";

export const metadata: Metadata = {
  title: "All Equipment",
  description:
    "Shop the full MasterKraft range - strength, weightlifting, cardio, rigs & racks, flooring, storage and more.",
  alternates: { canonical: "/all-equipment" },
};

const PER_PAGE = 24;

export default async function AllEquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const sort = sp.sort ?? "featured";
  const priceSort = sort === "price-asc" || sort === "price-desc";

  // The ERP is the catalogue now (lib/erp-catalogue.ts), so this page lists
  // UNITS: one card per product or per range, in the ERP's own grouping. The
  // WooCommerce snapshot is only the fallback for when Unleashed is unreachable.
  const unleashed = await getUnleashedMap().catch(() => ({}));
  const erpUsable = Object.keys(unleashed).length > 0;

  // Category dropdown groups: each category and its ProductSubGroups.
  const jumpGroups = categories.map((c) => ({
    label: c.label,
    slug: c.slug,
    children: c.erpGroup && erpUsable ? erpSubgroups(unleashed, c.erpGroup) : [],
  }));

  let units: ErpUnit[] = [];
  let all: WcProduct[] = [];
  let failed = false;

  if (erpUsable) {
    // Category order, then name — so the page reads down the catalogue the way
    // the navigation does rather than in WooCommerce's old menu_order.
    const order = new Map(categories.map((c, i) => [c.erpGroup, i]));
    units = [...erpUnits(unleashed).values()].sort(
      (a, b) =>
        (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99) || a.name.localeCompare(b.name)
    );
    if (sort === "name-asc") units.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "name-desc") units.sort((a, b) => b.name.localeCompare(a.name));
  } else {
    const products = await getAllProducts().catch(() => null);
    failed = products === null;
    all = products ?? [];
    if (sort === "name-asc") all.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "name-desc") all.sort((a, b) => b.name.localeCompare(a.name));
  }

  const total = erpUsable ? units.length : all.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  let cards: { product: WcProduct; enriched: EnrichedProduct }[] = [];
  if (erpUsable) {
    // ERP units already carry their price, so there is nothing to enrich and a
    // price sort costs one pass over an in-memory array rather than a fetch.
    let list = units.map(unitCard);
    if (priceSort) {
      list = list.sort((a, b) => {
        const av = a.enriched.priceValue;
        const bv = b.enriched.priceValue;
        if (av === 0 && bv === 0) return 0;
        if (av === 0) return 1; // POA always last
        if (bv === 0) return -1;
        return sort === "price-asc" ? av - bv : bv - av;
      });
    }
    cards = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  } else if (priceSort) {
    // Snapshot fallback: price sort needs corrected prices across the whole set.
    const enrichedAll = await Promise.all(
      all.map(async (product) => ({ product, enriched: await enrichCard(product, unleashed) })),
    );
    enrichedAll.sort((a, b) => {
      const av = a.enriched.priceValue;
      const bv = b.enriched.priceValue;
      if (av === 0 && bv === 0) return 0;
      if (av === 0) return 1;
      if (bv === 0) return -1;
      return sort === "price-asc" ? av - bv : bv - av;
    });
    cards = enrichedAll.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  } else {
    const slice = all.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    cards = await Promise.all(
      slice.map(async (product) => ({ product, enriched: await enrichCard(product, unleashed) })),
    );
  }

  const buildHref = (patch: { page?: string }) => {
    const p = new URLSearchParams();
    if (sort !== "featured") p.set("sort", sort);
    if (patch.page) p.set("page", patch.page);
    const qs = p.toString();
    return `/all-equipment${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHero
        eyebrow="Shop Equipment"
        title="All Equipment"
        subtitle="Commercial-grade equipment across every training modality - engineered for fitness, built to endure."
        image="/home/shop-equipment.jpg"
      />

      <section className="container-mk py-16">
        {failed || total === 0 ? (
          <div className="text-center max-w-2xl mx-auto py-8">
            <p className="font-mono text-xs tracking-widest text-accent uppercase">Catalogue</p>
            <h2 className="mt-4 text-2xl font-bold">Products are loading</h2>
            <p className="mt-4 text-ash leading-relaxed">
              Get in touch and we&apos;ll send specs, pricing and availability across the range.
            </p>
            <div className="mt-8">
              <Link href="/contact" className="btn btn-accent">
                Enquire <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-10 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between border-b border-line pb-4">
              <CategoryJumpNav groups={jumpGroups} />
              <SortSelect value={sort} />
            </div>

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
      </section>
    </>
  );
}
