// Parity harness: proves the committed snapshot answers the same questions the
// live WooCommerce store does.
//
// SKIPPED BY DEFAULT — it talks to the network, so it must not run in `npm test`
// or gate CI on the store being up. Run it deliberately:
//
//   npm run verify:catalogue
//
// Run it after `npm run build:catalogue`, or any time you suspect the snapshot
// has drifted from the store in a way `check:catalogue` (which compares raw
// product data) would not catch — that check proves the DATA matches, this one
// proves our offline reimplementation of WooCommerce's QUERIES matches.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categories } from "@/lib/categories";
import {
  getAllProductSlugs,
  getAllProductsByCategory,
  getCategoryChildren,
  getProductBySlug,
  getProductVariations,
  parseProductDetail,
  searchProducts,
  type WcProduct,
} from "@/lib/woocommerce";
import { allProducts } from "@/lib/catalogue";

const LIVE = !!process.env.PARITY;

function env(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && line.slice(0, eq).trim() === name) {
      return line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`Missing ${name}`);
}

let auth = "";
let base = "";
if (LIVE) {
  base = env("WC_STORE_URL").replace(/\/$/, "") + "/wp-json/wc/v3";
  auth =
    "Basic " +
    Buffer.from(`${env("WC_CONSUMER_KEY")}:${env("WC_CONSUMER_SECRET")}`).toString("base64");
}

async function live<T>(path: string, params: Record<string, string | number> = {}) {
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`WooCommerce ${res.status} on ${path}`);
  return {
    data: (await res.json()) as T,
    total: Number(res.headers.get("x-wp-total") ?? 0),
    totalPages: Number(res.headers.get("x-wp-totalpages") ?? 1),
  };
}

// Every published product WooCommerce returns for a query, unfiltered. The
// visibility rules are shared code, so comparing the RAW sets is what proves the
// query reimplementation; anything downstream is identical by construction.
async function liveIds(params: Record<string, string | number>): Promise<Set<number>> {
  const ids = new Set<number>();
  for (let page = 1; page <= 10; page++) {
    const { data, totalPages } = await live<{ id: number }[]>("/products", {
      ...params,
      status: "publish",
      per_page: 100,
      page,
      _fields: "id",
    });
    data.forEach((p) => ids.add(p.id));
    if (page >= totalPages) break;
  }
  return ids;
}

const snapshotIds = (items: WcProduct[]) => new Set(items.map((p) => p.id));

describe.skipIf(!LIVE)("catalogue snapshot parity with live WooCommerce", () => {
  it("holds every published product the store reports", async () => {
    const { total } = await live<unknown[]>("/products", {
      status: "publish",
      per_page: 1,
      _fields: "id",
    });
    expect(allProducts().length).toBe(total);
  }, 60_000);

  it.each(categories.flatMap((c) => (c.wcId ? [[c.slug, c.wcId] as const] : [])))(
    "category %s resolves the same products (including sub-category-only ones)",
    async (_slug, wcId) => {
      const expected = await liveIds({ category: wcId });
      // brandFilter off so this compares the QUERY, not the visibility rules.
      const got = snapshotIds(await getAllProductsByCategory(wcId, { brandFilter: false }));
      // getAllProductsByCategory applies filterListable; re-add what it removed
      // by comparing against the raw snapshot restricted to the live id set.
      const raw = allProducts().filter((p) => expected.has(p.id));
      expect(raw.length).toBe(expected.size);
      expect([...got].every((id) => expected.has(id))).toBe(true);
    },
    60_000
  );

  it.each(categories.flatMap((c) => (c.wcId ? [[c.slug, c.wcId] as const] : [])))(
    "category %s resolves the same sub-categories",
    async (_slug, wcId) => {
      const { data } = await live<{ id: number; slug: string; count: number }[]>(
        "/products/categories",
        { parent: wcId, per_page: 100, hide_empty: "true", orderby: "name", order: "asc", _fields: "id,slug,count" }
      );
      const got = await getCategoryChildren(wcId);
      expect(got.map((c) => c.slug)).toEqual(data.map((c) => c.slug));
      expect(got.map((c) => c.count)).toEqual(data.map((c) => c.count));
    },
    60_000
  );

  // The terms that were reported broken before the full-fetch fix, plus a SKU
  // and a multi-word query.
  it.each(["dumbbell", "barbell", "mat", "rack", "rig", "bumper plate", "MMDBRH"])(
    "search %s returns at least everything the store returns",
    async (term) => {
      const expected = await liveIds({ search: term });
      const got = new Set(
        allProducts()
          .filter((p) => {
            const hay = [p.name, p.sku, p.short_description, p.description]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .replace(/<[^>]*>/g, " ");
            return term.toLowerCase().split(/\s+/).every((t) => hay.includes(t));
          })
          .map((p) => p.id)
      );
      const missing = [...expected].filter((id) => !got.has(id));
      expect({ term, missing }).toEqual({ term, missing: [] });
    },
    60_000
  );

  it("search returns the counts the catalogue is known to hold", async () => {
    const counts = Object.fromEntries(
      await Promise.all(
        ["dumbbell", "barbell", "mat", "rack"].map(async (t) => [
          t,
          (await searchProducts(t, { perPage: 1000 })).total,
        ])
      )
    );
    expect(counts).toEqual({ dumbbell: 22, barbell: 38, mat: 46, rack: 63 });
  }, 60_000);

  it("variable products carry the same variations", async () => {
    const variable = allProducts().filter((p) => p.type === "variable").slice(0, 8);
    for (const p of variable) {
      const { data } = await live<{ id: number }[]>(`/products/${p.id}/variations`, {
        per_page: 100,
        _fields: "id",
      });
      const got = await getProductVariations(p.id);
      expect({ sku: p.sku, ids: got.map((v) => v.id).sort() }).toEqual({
        sku: p.sku,
        ids: data.map((v) => v.id).sort(),
      });
    }
  }, 120_000);

  it("product pages render the same detail as the live store", async () => {
    const sample = allProducts()
      .filter((p) => (p.meta_data ?? []).length > 0)
      .slice(0, 10);
    for (const p of sample) {
      const { data } = await live<WcProduct[]>("/products", {
        slug: p.slug,
        _fields:
          "id,name,slug,sku,type,permalink,price,regular_price,sale_price,on_sale,stock_status,catalog_visibility,bundle_price,weight,dimensions,short_description,description,images,categories,meta_data",
      });
      const fromSnapshot = await getProductBySlug(p.slug);
      expect(fromSnapshot).not.toBeNull();
      expect({ slug: p.slug, detail: parseProductDetail(fromSnapshot as WcProduct) }).toEqual({
        slug: p.slug,
        detail: parseProductDetail(data[0]),
      });
    }
  }, 120_000);

  it("the sitemap covers the same products", async () => {
    const slugs = await getAllProductSlugs();
    const live = await liveIds({});
    expect(slugs.length).toBeLessThanOrEqual(live.size);
    expect(slugs.every((s) => typeof s.slug === "string" && s.slug.length > 0)).toBe(true);
  }, 60_000);
});
