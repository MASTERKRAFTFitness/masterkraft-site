import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageHero from "@/components/marketing/PageHero";
import CategoryBrowser, { type BrowserSearchParams } from "@/components/shop/CategoryBrowser";
import { categories, getCategory } from "@/lib/categories";

export function generateStaticParams() {
  return categories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<BrowserSearchParams>;
}): Promise<Metadata> {
  const { category } = await params;
  const c = getCategory(category);
  if (!c) return { title: "Equipment" };

  // PAGE 2 IS NOT PAGE 1, and used to say it was. This canonical was hardcoded
  // to the bare category URL, so every paginated view declared itself a
  // duplicate of the first page — the pattern Google's own pagination guidance
  // names as the way to get paginated content dropped. The products stayed
  // discoverable only because the sitemap lists every one of them directly.
  //
  // THE FACETS STILL COLLAPSE, deliberately. sort, sub, min and max reorder or
  // filter the same set of products; page shows a DIFFERENT set. Only the one
  // that changes which products are on the page gets to be its own URL.
  //
  // `?sub=` IS THE ONE THAT MOVED. A subgroup somebody has written a page for
  // now has a URL of its own under /equipment/<category>/<sub> and is linked
  // from the facet bar — see lib/subcategories.ts. The parameter still works,
  // still filters, and still collapses here, because a filter with no page
  // behind it is exactly that.
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const canonical = page > 1 ? `/equipment/${c.slug}?page=${page}` : `/equipment/${c.slug}`;

  // THE TITLE IS NOT THE H1. `seoTitle` where the category has one — see the
  // field in lib/categories.ts for why ten of these were a single word plus the
  // brand. Page 2 stays on the label: a paginated view wants to be
  // distinguishable in a search result, not to compete with page 1 for the same
  // phrase.
  const title = page > 1 ? `${c.label} — Page ${page}` : c.seoTitle ?? c.label;

  return {
    title,
    description: c.meta,
    alternates: { canonical },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<BrowserSearchParams>;
}) {
  const { category } = await params;
  const c = getCategory(category);
  // Unreachable: layout.tsx has already 404'd on an unknown category, before
  // loading.tsx could stream a 200 over the top of it. Kept because it is what
  // narrows `c` for everything below, and because a guard that only holds while
  // a sibling file exists should say so rather than disappear.
  if (!c) notFound();

  const sp = await searchParams;

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
      <CategoryBrowser
        category={c}
        basePath={`/equipment/${c.slug}`}
        listName={`${c.label} — MasterKraft`}
        aboutHeading={c.label}
        about={c.about}
        searchParams={sp}
      />
    </>
  );
}
