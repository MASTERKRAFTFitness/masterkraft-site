// An equipment SUBCATEGORY: /equipment/<category>/<subcategory>.
//
// WHY THIS URL SHAPE. It is the one the old WordPress store used and the one
// Google still ranks on this domain — /equipment/body-weight/gymnastics sits at
// 44-45 for two rings keywords while the URL itself has answered a 404 or a
// redirect since the cutover. Recovering the exact shape is worth more than
// inventing a tidier one. See the header of lib/subcategories.ts.
//
// AN UNWRITTEN SUBCATEGORY IS NOT A 404. Before this route existed, a
// next.config redirect sent every /equipment/:category/:sub to the category's
// `?sub=` filter, which is the right answer for a subgroup nobody has written a
// page for and for a slug that means nothing at all. That behaviour is kept,
// here rather than in the config, because only this route knows which
// subcategories have pages — and the config would have to be edited in step
// with the registry to stay true.
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import PageHero from "@/components/marketing/PageHero";
import CategoryBrowser, { type BrowserSearchParams } from "@/components/shop/CategoryBrowser";
import { getCategory } from "@/lib/categories";
import { getSubcategory, subcategories } from "@/lib/subcategories";

export function generateStaticParams() {
  return subcategories.map((s) => ({ category: s.category, sub: s.slug }));
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; sub: string }>;
  searchParams: Promise<BrowserSearchParams>;
}): Promise<Metadata> {
  const { category, sub } = await params;
  const s = getSubcategory(category, sub);
  if (!s) return { title: "Equipment" };

  // Same rule as the category above it: pagination earns a URL, every other
  // parameter collapses onto this page.
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const path = `/equipment/${s.category}/${s.slug}`;

  return {
    // `seoTitle` where the label is a single noun — same split, and the same
    // page-2 carve-out, as the category above it.
    title: page > 1 ? `${s.label} — Page ${page}` : s.seoTitle ?? s.label,
    description: s.meta,
    alternates: { canonical: page > 1 ? `${path}?page=${page}` : path },
  };
}

export default async function SubcategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; sub: string }>;
  searchParams: Promise<BrowserSearchParams>;
}) {
  const { category, sub } = await params;
  const c = getCategory(category);
  // The category layout has already 404'd an unknown category.
  if (!c) permanentRedirect("/all-equipment");

  const s = getSubcategory(category, sub);
  if (!s) permanentRedirect(`/equipment/${c.slug}?sub=${encodeURIComponent(sub)}`);

  const sp = await searchParams;

  return (
    <>
      <PageHero
        eyebrow={c.label}
        title={s.label}
        subtitle={s.blurb}
        image={c.image}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Equipment", href: "/all-equipment" },
          { name: c.label, href: `/equipment/${c.slug}` },
          { name: s.label, href: `/equipment/${c.slug}/${s.slug}` },
        ]}
      />
      <CategoryBrowser
        category={c}
        subgroup={s.erpSubgroup}
        basePath={`/equipment/${c.slug}/${s.slug}`}
        listName={`${s.label} — MasterKraft`}
        aboutHeading={s.label}
        about={s.about}
        searchParams={sp}
      />
    </>
  );
}
