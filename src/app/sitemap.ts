import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { categories } from "@/lib/categories";
import { subcategories } from "@/lib/subcategories";
import { fitouts } from "@/lib/fitouts";
import { revlSites } from "@/lib/revl";
import { locations } from "@/lib/locations";
import { getAllProductSlugs } from "@/lib/woocommerce";
import { erpUnits } from "@/lib/erp-catalogue";
import { getUnleashedMap } from "@/lib/unleashed";
import { BLOG_PREFIX, BLOG_SITE_URL, authorPath, blogEnabled, listAuthors, listPosts, postPath } from "@/lib/blog";

export const revalidate = 86400; // rebuild sitemap daily

const staticPaths = [
  "",
  "/our-story",
  "/contact",
  "/fitout-solution",
  "/resources",
  "/distributor",
  "/fitout",
  "/revl-fitouts",
  "/all-equipment",
  "/warranty",
  "/returns",
  "/finance",
  "/shipping",
  "/delivery-information",
  "/fitpass",
  "/forms",
  "/become-a-member",
  "/process-overview",
  "/our-process",
  "/terms-and-conditions",
  "/privacy-policy",
  "/wholesale-store",
  "/recovery-roller",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: "monthly",
    priority: p === "" ? 1 : 0.7,
  }));

  for (const c of categories) entries.push({ url: `${SITE_URL}/equipment/${c.slug}`, changeFrequency: "weekly", priority: 0.8 });
  // Subcategories rank for the terms a category page is too broad to win, and
  // they are the URL shape the old store held — so they are advertised, at the
  // same weight as their parent. Only the written ones exist; see
  // lib/subcategories.ts for why that list is not every subgroup.
  for (const s of subcategories) {
    entries.push({
      url: `${SITE_URL}/equipment/${s.category}/${s.slug}`,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }
  for (const f of fitouts) entries.push({ url: `${SITE_URL}/fitout/${f.slug}`, changeFrequency: "monthly", priority: 0.7 });
  for (const l of locations) entries.push({ url: `${SITE_URL}/gym-fitouts/${l.slug}`, changeFrequency: "monthly", priority: 0.8 });
  for (const r of revlSites) entries.push({ url: `${SITE_URL}/revl-fitouts/${r.slug}`, changeFrequency: "monthly", priority: 0.5 });

  try {
    // Obsolete product URLs 404, so they are not advertised here either:
    // getAllProductSlugs applies both halves of the rule.
    // The ERP is the catalogue, so its units are what the sitemap lists: 165 of
    // them have no WooCommerce record and would otherwise be sold on the site
    // and absent from its sitemap. Snapshot slugs stay as the fallback.
    const erp = await getUnleashedMap().catch(() => ({}));
    const units = [...erpUnits(erp).values()];
    const products = units.length
      ? units.map((u) => ({ slug: u.slug, sku: u.codes[0], modified: undefined }))
      : await getAllProductSlugs();
    for (const p of products) {
      entries.push({
        url: `${SITE_URL}/product/${p.slug}`,
        lastModified: p.modified ? new Date(p.modified) : undefined,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } catch {
    // products are best-effort — skip if the store is unreachable at build
  }

  // THE BLOG: the index, each author with a live post, and every live post —
  // the same set /blog answers (lib/blog-route), read from the same cached
  // Journal, so what this advertises and what the route serves cannot drift.
  //
  // Best-effort like the products above, and for a sharper reason: this file is
  // the sitemap for the whole site. A database outage at build time must cost the
  // blog's URLs, not every product URL on masterkraft.com.
  if (blogEnabled()) {
    try {
      const [posts, authors] = await Promise.all([listPosts(), listAuthors()]);
      const newest = posts[0]?.modifiedAt ?? posts[0]?.publishedAt;
      const blogUrls: { path: string; lastModified?: string }[] = [
        { path: BLOG_PREFIX, lastModified: newest },
        ...authors.map((a) => ({
          path: authorPath(a.slug),
          lastModified: a.posts[0]?.modifiedAt ?? a.posts[0]?.publishedAt,
        })),
        ...posts.map((p) => ({ path: postPath(p.slug), lastModified: p.modifiedAt ?? p.publishedAt })),
      ];
      for (const u of blogUrls) {
        entries.push({
          url: `${BLOG_SITE_URL}${u.path}`,
          ...(u.lastModified ? { lastModified: new Date(u.lastModified) } : {}),
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    } catch (e) {
      console.warn("[blog] routes missing from sitemap", e);
    }
  }

  return entries;
}
