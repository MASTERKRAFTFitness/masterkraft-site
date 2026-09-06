import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import ProductCard from "@/components/shop/ProductCard";
import { searchProducts, type WcProduct } from "@/lib/woocommerce";
import { getUnleashedMap, enrichCard } from "@/lib/unleashed";
import { searchErpUnits, unitCard } from "@/lib/erp-catalogue";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  type Card = { product: WcProduct; enriched: Awaited<ReturnType<typeof enrichCard>> };

  let products: WcProduct[] = [];
  let total = 0;
  let totalPages = 1;
  // null means "we have nothing to show" - no query, or the lookup failed.
  // THE JSX IS BUILT OUTSIDE THE try/catch ON PURPOSE. Wrapping the return in it
  // made this catch swallow render errors as well as lookup errors, so a broken
  // ProductCard would silently render as "no products matched" instead of
  // reaching an error boundary. Only the fetching is guarded now.
  let cards: Card[] | null = null;

  if (q) {
    const unleashed = await getUnleashedMap().catch(() => ({}));
    try {
      // Search the ERP, which is the catalogue. It holds 165 units that have no
      // WooCommerce record at all, and a product that is sold but unfindable is
      // not really on the site. Falls back to the snapshot when the ERP is
      // unreachable, so search degrades rather than returning nothing.
      const erpUsable = Object.keys(unleashed).length > 0;
      if (erpUsable) {
        const hits = searchErpUnits(unleashed, q);
        total = hits.length;
        totalPages = Math.max(1, Math.ceil(total / 24));
        cards = hits.slice((page - 1) * 24, page * 24).map(unitCard);
        products = cards.map((c) => c.product);
      } else {
        const res = await searchProducts(q, { page, perPage: 24 });
        products = res.data;
        total = res.total;
        totalPages = res.totalPages;
        cards = await Promise.all(
          products.map(async (product) => ({ product, enriched: await enrichCard(product, unleashed) }))
        );
      }
    } catch {
      // Fall through to the empty state, and reset anything half-assigned above.
      cards = null;
      products = [];
      total = 0;
      totalPages = 1;
    }
  }

  if (cards) {
    return (
      <>
        <PageHero eyebrow="Search" title={`Results for “${q}”`} subtitle={`${total} product${total === 1 ? "" : "s"} found`} />
        <section className="container-mk py-16">
          {products.length === 0 ? (
            <Empty q={q} />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
                {cards.map(({ product, enriched }) => (
                  <ProductCard key={product.id} product={product} enriched={enriched} />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="mt-14 flex items-center justify-center gap-4 font-mono text-sm uppercase tracking-widest">
                  {page > 1 ? (
                    <Link href={`/search?q=${encodeURIComponent(q)}&page=${page - 1}`} className="btn btn-out !text-ink">
                      ← Prev
                    </Link>
                  ) : (
                    <span className="btn btn-out opacity-60 !text-ink pointer-events-none">← Prev</span>
                  )}
                  <span className="text-ash">Page {page} of {totalPages}</span>
                  {page < totalPages ? (
                    <Link href={`/search?q=${encodeURIComponent(q)}&page=${page + 1}`} className="btn btn-out !text-ink">
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

  return (
    <>
      <PageHero eyebrow="Search" title={q ? `Results for “${q}”` : "Search"} />
      <section className="container-mk py-16">
        <Empty q={q} />
      </section>
    </>
  );
}

function Empty({ q }: { q: string }) {
  return (
    <div className="text-center max-w-md mx-auto py-8">
      <p className="text-ash text-lg">
        {q ? `No products matched “${q}”.` : "Type a search term to find equipment."}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Link href="/all-equipment" className="btn btn-accent">
          Browse All Equipment <span aria-hidden>→</span>
        </Link>
        <Link href="/contact" className="btn btn-out !text-ink">
          Ask Us
        </Link>
      </div>
    </div>
  );
}
