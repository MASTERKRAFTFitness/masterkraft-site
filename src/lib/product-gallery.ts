// The gallery Unleashed has no room for, read from Supabase.
//
// SERVER ONLY, like admin-db: this uses the service role key, and every table it
// touches has RLS on with no policies, so nothing else can read them.
//
// WHY THIS IS A SEPARATE READ AND NOT PART OF getUnleashedMap. They fail
// independently and should degrade independently. The ERP map is the product —
// price, stock, the photograph a page leads with — and when it is empty the
// listing pages fall back to the snapshot wholesale. This is presentation on top
// of that, and an empty answer means "no extra angles", which is a page that
// looks slightly plainer rather than a page that is wrong. Folding it into the
// map would let a Supabase outage empty the catalogue.
//
// It is also the FIRST read of Supabase on the render path. product_content has
// been loaded since 5 September and is still not read by anything — the copy on
// the site comes from the frozen snapshot. So this is the pattern that one will
// follow, and the caching and the failure mode are the parts worth getting
// right here.
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/admin-db";

/** Ordered, site-relative image paths, keyed by ERP code (or `-GROUP` SKU). */
export type Gallery = Record<string, string[]>;

async function buildGallery(): Promise<Gallery> {
  const db = adminDb();
  // Unconfigured is not an error. Local checkouts and the report scripts run
  // without Supabase credentials, and the site rendered without this table at
  // all until 8 September.
  if (!db) return {};

  const { data, error } = await db.from("product_images").select("erp_code, images");
  if (error) throw new Error(`product_images: ${error.message}`);

  const out: Gallery = {};
  for (const row of data ?? []) {
    const code = String(row.erp_code ?? "").trim().toUpperCase();
    const images = (row.images ?? []) as string[];
    if (!code || !images.length) continue;
    // Site-relative only. The WordPress host is gone, so a row that somehow
    // holds an absolute URL would render a broken image on a live page; drop it
    // here rather than let it through. The loader will not write one.
    const safe = images.filter((s) => typeof s === "string" && s.startsWith("/"));
    if (safe.length) out[code] = safe;
  }
  return out;
}

// An hour, matching the ERP map. These are curated by hand and change far less
// often than stock does, so the shorter of the two intervals is the one that
// matters and there is nothing to gain from being tighter.
//
// VERSION THE KEY when the shape or the meaning of a value changes, for the
// reason the unleashed map's v7 documents: a warm cache keeps serving the old
// answer for the full hour, and the fix looks like it did not deploy.
const cachedGallery = unstable_cache(buildGallery, ["product-gallery-v1"], {
  revalidate: 3600,
  tags: ["product-images"],
});

/**
 * Extra photographs by ERP code. Empty on any failure.
 *
 * FAILS SOFT ON PURPOSE. Every caller is a page that already has a photograph
 * from the ERP; this only ever adds more. An outage here should cost a visitor
 * the second angle, not the page.
 */
export async function getGallery(): Promise<Gallery> {
  try {
    return await cachedGallery();
  } catch (e) {
    console.error("[product-gallery] read failed", e);
    return {};
  }
}
