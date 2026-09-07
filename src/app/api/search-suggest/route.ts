import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/woocommerce";
import { getUnleashedMap, withErpImages } from "@/lib/unleashed";
import { getGallery } from "@/lib/product-gallery";

// Lightweight typeahead: product name/slug/image only (no pricing, for speed).
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });
  try {
    const { data } = await searchProducts(q, { perPage: 6, maxPages: 1 });
    // The thumbnail comes from the ERP, like the card the visitor lands on. The
    // map is the 60-minute cached one every listing page has already built, so
    // this is a cache read; on the cold instance that has to build it the
    // suggestions arrive late rather than wrong, and an outright failure still
    // falls through to the snapshot's own image rather than dropping the row.
    const [unleashed, gallery] = await Promise.all([
      getUnleashedMap().catch(() => ({})),
      getGallery(),
    ]);
    const results = data.map((p) => withErpImages(p, unleashed, gallery)).map((p) => ({
      slug: p.slug,
      name: p.name,
      image: p.images?.[0]?.src ?? null,
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
