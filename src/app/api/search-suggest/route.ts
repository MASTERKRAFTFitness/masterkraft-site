import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/woocommerce";
import { getUnleashedMap, filterUnleashedObsolete } from "@/lib/unleashed";

// Lightweight typeahead: product name/slug/image only (no pricing, for speed).
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });
  try {
    const { data } = await searchProducts(q, { perPage: 6 });
    const unleashed = await getUnleashedMap().catch(() => ({}));
    const results = filterUnleashedObsolete(data, unleashed).map((p) => ({
      slug: p.slug,
      name: p.name,
      image: p.images?.[0]?.src ?? null,
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
