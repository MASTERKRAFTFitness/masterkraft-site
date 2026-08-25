import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { categories } from "@/lib/categories";
import { fitouts } from "@/lib/fitouts";
import { revlSites } from "@/lib/revl";
import { locations } from "@/lib/locations";
import { getAllProductSlugs } from "@/lib/woocommerce";

export const revalidate = 86400; // rebuild sitemap daily

const staticPaths = [
  "",
  "/our-story",
  "/contact",
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
  for (const f of fitouts) entries.push({ url: `${SITE_URL}/fitout/${f.slug}`, changeFrequency: "monthly", priority: 0.7 });
  for (const l of locations) entries.push({ url: `${SITE_URL}/gym-fitouts/${l.slug}`, changeFrequency: "monthly", priority: 0.8 });
  for (const r of revlSites) entries.push({ url: `${SITE_URL}/revl-fitouts/${r.slug}`, changeFrequency: "monthly", priority: 0.5 });

  try {
    // Obsolete product URLs 404, so they are not advertised here either:
    // getAllProductSlugs applies both halves of the rule.
    const products = await getAllProductSlugs();
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

  return entries;
}
