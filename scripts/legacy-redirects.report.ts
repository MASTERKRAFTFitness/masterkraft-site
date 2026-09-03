// The WordPress-era redirect map: every URL the old store served that this site
// does not, pointed at the nearest thing we do serve.
//
//   src/data/legacy-redirects.json   consumed by next.config.ts
//
// Run:  npm run build:redirects      (then commit the JSON)
//       npm run check:redirects      (drift only, writes nothing)
//
// WHY THESE ARE `redirects` IN next.config AND NOT A DATABASE. Next's own
// guidance (docs/01-app/02-guides/redirecting.md, "Managing redirects at
// scale") puts the threshold for a data-backed map at 1000+, because Vercel
// caps next.config redirects at 1,024. This map is under 400. Config redirects
// are matched before Proxy and before any rendering, so they cost no round trip
// and have no failure mode; a database read here would put a network call in
// front of traffic that is overwhelmingly crawlers hitting dead WordPress URLs,
// and would hand back the 404s the moment that database was unreachable. The
// data is also frozen — the WordPress store is gone, so these slugs can never
// change again — which is the same argument catalogue.ts and obsolete.ts already
// make for committing a snapshot rather than fetching one.
//
// WHY IT IMPORTS THE APP. What is servable is decided by four rules living at
// one chokepoint in woocommerce.ts, plus the ERP unit list in erp-catalogue.ts.
// A generator that reimplemented either would eventually redirect a page that
// still serves — which, because config redirects are matched BEFORE routing,
// silently deletes that page. So the rules are imported, never restated.
//
// THE TRAP THAT MAKES THAT REAL: THE ERP PATH RESCUES SLUGS THE WOO RULE KILLS.
// The product page serves when EITHER a Woo product or an ERP unit answers to
// the slug (`if (!wooProduct && !unit) notFound()`). erpUnits() filters on the
// ERP's own brand field (MK / CONCEPT 2 / NO BRAND), not on the SKU prefix, and
// wooPageFor() lets a unit adopt an existing WooCommerce page to keep its URL.
// So a slug can fail the Woo brand rule and still serve. At the time of writing
// that is true of 8 R-prefixed (REVL) slugs and 2 S-prefixed ones — pages like
// `pro-bumper-plates` and `power-bands`, which the ERP files under our own
// brands. Redirecting them would take live, sitemap-advertised pages off the
// site. Every ERP-claimed slug is therefore subtracted before anything is
// written, and the assertions at the end refuse to emit a map that collides
// with a servable URL.
//
// It fetches Unleashed directly rather than through getUnleashedMap(), which is
// wrapped in next/cache's unstable_cache and throws outside a Next request. The
// normalisation below is deliberately the same handful of lines as buildMap().
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { erpUnits } from "@/lib/erp-catalogue";
import { allProducts, categoryTerms, type CategoryTerm } from "@/lib/catalogue";
import { categories } from "@/lib/categories";
import { isForeignBrandSku, isObsolete } from "@/lib/woocommerce";
import type { UnleashedMap, UnleashedEntry } from "@/lib/unleashed";

const OUT = "src/data/legacy-redirects.json";
const CHECK = process.env.CHECK === "1";

// Vercel's ceiling is 1,024. Fail well short of it: crossing this line is the
// signal to move to the Proxy + Bloom filter approach the Next docs describe,
// not to quietly ship a map the platform will truncate.
const MAX_REDIRECTS = 900;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ])
);

type RawProduct = {
  ProductCode?: string;
  DefaultSellPrice?: number | string;
  ProductDescription?: string;
  ImageUrl?: string;
  Images?: { Url?: string; IsDefault?: boolean }[];
  ProductBrand?: { BrandName?: string };
  ProductGroup?: { GroupName?: string };
  ProductSubGroup?: { GroupName?: string };
  IsSellable?: boolean;
};

async function productsPage(n: number) {
  const q = "pageSize=200";
  const res = await fetch(`https://api.unleashedsoftware.com/Products/${n}?${q}`, {
    headers: {
      "api-auth-id": env.UNLEASHED_API_ID,
      "api-auth-signature": crypto
        .createHmac("sha256", env.UNLEASHED_API_KEY)
        .update(q)
        .digest("base64"),
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!res.ok) throw new Error(`Unleashed ${res.status} on Products/${n}`);
  return res.json() as Promise<{ Items: RawProduct[]; Pagination?: { NumberOfPages?: number } }>;
}

// ---------------------------------------------------------------- destinations
//
// WooCommerce's own term tree decides where an archive goes. Each site category
// records the Woo term it used to list from (`wcId` in lib/categories.ts), so
// walking a term up its parents until one of those ids appears maps 66 of the
// 69 non-empty terms without anybody guessing. The three that do not resolve are
// named below, because they are not equipment categories at all.
const WC_TO_SITE = new Map(
  categories.filter((c) => c.wcId).map((c) => [c.wcId as number, `/equipment/${c.slug}`])
);

// Terms with no parent chain into an equipment category.
//
//   new-products     a promotional cross-section of everything, not a range.
//   studio-kit       REVL's own kit, and every product in it carries an R SKU.
//                    Pointing a REVL-branded archive at a MasterKraft category
//                    would be a bait-and-switch; /revl-fitouts is a real page
//                    about the REVL studios we actually built, and it survives
//                    the brand removal because it is our work, not their range.
//   freight-delivery a freight line item that was never a product.
//   uncategorised    WooCommerce's default bucket.
const TERM_OVERRIDES: Record<string, string> = {
  "new-products": "/all-equipment",
  "studio-kit": "/revl-fitouts",
  "freight-delivery": "/shipping",
  uncategorised: "/all-equipment",
};

function resolveTerm(term: CategoryTerm, byId: Map<number, CategoryTerm>): string | null {
  const override = TERM_OVERRIDES[term.slug];
  if (override) return override;
  let cur: CategoryTerm | undefined = term;
  // Bounded: a cycle in the term tree must not hang the build.
  for (let hops = 0; cur && hops < 10; hops++) {
    const site = WC_TO_SITE.get(cur.id);
    if (site) return site;
    cur = byId.get(cur.parent);
  }
  return null;
}

it("writes the legacy redirect map", async () => {
  const first = await productsPage(1);
  const items = [...first.Items];
  for (let n = 2; n <= (first.Pagination?.NumberOfPages ?? 1); n++) {
    items.push(...(await productsPage(n)).Items);
  }

  const map: UnleashedMap = {};
  for (const p of items) {
    if (!p.ProductCode) continue;
    const price = parseFloat(String(p.DefaultSellPrice ?? "0"));
    const image = p.Images?.find((i) => i.IsDefault)?.Url ?? p.Images?.[0]?.Url ?? p.ImageUrl;
    map[p.ProductCode.toUpperCase()] = {
      price: price > 0 ? Math.round(price * 1.1 * 100) / 100 : 0,
      stock: 0,
      name: p.ProductDescription?.trim() || undefined,
      image: image || undefined,
      brand: p.ProductBrand?.BrandName?.trim() || undefined,
      group: p.ProductGroup?.GroupName?.trim() || undefined,
      subgroup: p.ProductSubGroup?.GroupName?.trim() || undefined,
      sellable: p.IsSellable !== false,
    } satisfies UnleashedEntry;
  }

  // Every slug the ERP answers to. These SERVE, whatever the Woo rules say.
  const erpSlugs = new Set([...erpUnits(map).values()].map((u) => u.slug));

  const terms = categoryTerms();
  const byId = new Map(terms.map((t) => [t.id, t]));
  const redirects: { source: string; destination: string }[] = [];
  const unresolvedTerms: string[] = [];

  // ----------------------------------------------------------- category archives
  //
  // Empty terms are included. A term holding no products today still had a URL
  // on WordPress, and a redirect for it costs one row.
  for (const t of terms) {
    const destination = resolveTerm(t, byId);
    if (!destination) {
      unresolvedTerms.push(t.slug);
      continue;
    }
    redirects.push({ source: `/product-category/${t.slug}`, destination });
  }

  // ------------------------------------------------------------------- products
  //
  // The rule is imported, not restated: unservable is exactly what
  // woocommerce.ts means by it, minus anything the ERP still answers to.
  const products = allProducts();
  let rescued = 0;
  for (const p of products) {
    const unservable = isObsolete(p) || isForeignBrandSku(p.sku);
    if (!unservable) continue;
    if (erpSlugs.has(p.slug)) {
      rescued++;
      continue;
    }
    // Most specific resolvable term wins; a product with no mappable term at
    // all lands on the full catalogue rather than nowhere.
    let destination = "/all-equipment";
    for (const c of p.categories ?? []) {
      const term = terms.find((t) => t.id === c.id);
      const site = term && resolveTerm(term, byId);
      if (site) {
        destination = site;
        break;
      }
    }
    redirects.push({ source: `/product/${p.slug}`, destination });
  }

  // ------------------------------------------------------------------ structural
  //
  // The sitemap advertises /gym-fitouts/<city> under a parent that never
  // existed. /fitout is that page in all but name — its <title> is literally
  // "Gym Fitouts | Design, Supply & Install".
  redirects.push({ source: "/gym-fitouts", destination: "/fitout" });

  // ------------------------------------------------------------------ assertions
  //
  // A redirect whose source still serves is worse than the 404 it replaces: it
  // deletes a working page, and config redirects are matched before routing, so
  // nothing downstream can veto it.
  const servable = new Set(
    products.filter((p) => !(isObsolete(p) || isForeignBrandSku(p.sku))).map((p) => `/product/${p.slug}`)
  );
  for (const s of erpSlugs) servable.add(`/product/${s}`);
  const collisions = redirects.filter((r) => servable.has(r.source));
  if (collisions.length) {
    throw new Error(
      `${collisions.length} redirect sources still serve: ${collisions.slice(0, 5).map((c) => c.source).join(", ")}`
    );
  }

  const sources = new Set(redirects.map((r) => r.source));
  if (sources.size !== redirects.length) throw new Error("duplicate redirect sources");
  if (redirects.length > MAX_REDIRECTS) {
    throw new Error(`${redirects.length} redirects exceeds the ${MAX_REDIRECTS} ceiling — see the header`);
  }

  redirects.sort((a, b) => a.source.localeCompare(b.source));

  const json =
    JSON.stringify(
      {
        _comment:
          "GENERATED by scripts/legacy-redirects.report.ts — do not edit by hand. " +
          "WordPress-era URLs this site does not serve, pointed at the nearest thing it does. " +
          "Re-run with `npm run build:redirects` after any change to the visibility rules.",
        generatedFrom: `${products.length} snapshot products, ${terms.length} WooCommerce terms, ${erpSlugs.size} ERP units`,
        redirects,
      },
      null,
      2
    ) + "\n";

  const previous = (() => {
    try {
      return readFileSync(OUT, "utf8");
    } catch {
      return "";
    }
  })();

  if (CHECK) {
    if (previous !== json) {
      throw new Error(`${OUT} is out of date — run \`npm run build:redirects\` and commit it`);
    }
    console.log(`${OUT} is up to date (${redirects.length} redirects)`);
    return;
  }

  writeFileSync(OUT, json);
  console.log(`Wrote ${OUT}`);
  console.log(`  ${redirects.filter((r) => r.source.startsWith("/product-category/")).length} category archives`);
  console.log(`  ${redirects.filter((r) => r.source.startsWith("/product/")).length} product URLs`);
  console.log(`  ${rescued} unservable slugs left alone because the ERP still serves them`);
  if (unresolvedTerms.length) console.log(`  unmapped terms: ${unresolvedTerms.join(", ")}`);
  console.log(`  ${redirects.length} total, ceiling ${MAX_REDIRECTS}`);
}, 300000);
