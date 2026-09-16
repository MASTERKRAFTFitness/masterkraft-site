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
import { buildSitemapEntries } from "@opinly/shared";
import { blogConfig, blogEnabled, getOpinly } from "@/lib/opinly-content";

export const revalidate = 86400; // rebuild sitemap daily

const staticPaths = [
  "",
  "/our-story",
  "/contact",
  "/contact/enquiry",
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

  // THE BLOG, from Opinly's own route list rather than from a list kept here.
  //
  // `routes()` returns every addressable content route — home, posts,
  // categories, authors, tags — and buildSitemapEntries applies the same
  // prefixes lib/blog-route matches on, so what this file ADVERTISES and what
  // /blog ANSWERS cannot drift apart. Writing them out by hand is how a sitemap
  // ends up submitting tag URLs that 404.
  //
  // Best-effort like the products above, and for a sharper reason: this file is
  // the sitemap for the whole site. An Opinly outage at build time must cost the
  // blog's URLs, not every product URL on masterkraft.com.
  if (blogEnabled()) {
    try {
      const routes = await getOpinly().routes();
      for (const entry of buildSitemapEntries(routes, blogConfig)) {
        entries.push({
          url: entry.url,
          lastModified: new Date(entry.lastModified),
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    } catch (e) {
      console.warn("[opinly] blog routes missing from sitemap", e);
    }
  }

  return entries;
}
