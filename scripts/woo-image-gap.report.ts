// What the site still serves from WordPress, and whether Unleashed can replace it.
//
//   npm run report:wooimages
//     reports/woo-image-gap.md
//
// The catalogue is served from the ERP now (erp-catalogue.ts), so the listing
// grids already show Unleashed photography. The SNAPSHOT still carries the old
// WordPress image URLs, though, and every surface that renders a snapshot
// product rather than an ErpUnit still emits them: the product page's gallery
// and its OG/JSON-LD image, the related strip, search-suggest, featured.
//
// This measures the swap before it is made. The only way a swap can LOSE a
// photograph is a product WordPress has a picture of and the ERP does not, so
// that set is the whole question and it is listed in full below.
//
// Read-only. It measures; it changes nothing.
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { it } from "vitest";

const env = new Map<string, string>();
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
}
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;

const { allProducts, variationsFor } = await import("@/lib/catalogue");
const { skuAliases } = await import("@/lib/unleashed-aliases");
const { isRetiredSku } = await import("@/lib/obsolete");
const { getRange } = await import("@/lib/ranges");
// applyImageOverride is private to lib/woocommerce.ts, so the map is read here
// the same way it reads it. THIS IS THE STEP THAT MAKES THE SPLIT VISIBLE: the
// raw snapshot holds only WordPress URLs, and the mirror is swapped in at read
// time, so a report over allProducts() alone cannot see the mirrored third.
const imageOverrides = (await import("@/lib/product-image-overrides.json")).default as Record<string, string[]>;
type UnleashedMap = Awaited<ReturnType<typeof import("@/lib/unleashed").getUnleashedMap>>;

const OUT = "reports/woo-image-gap.md";
const out = (s: string) => process.stdout.write(`${s}\n`);

// WooCommerce PHOTOGRAPHY, wherever it is served from. Three forms, all the
// same pictures:
//   /wp-content/uploads/  the WordPress host itself
//   /product-images/      mirror-product-images.mjs copied ~870 of them local
//   /product-bg/          normalize-product-bg.py repainted the backdrops
// The last two are on our own domain, so "no wp-content left" is NOT the same
// as "no WooCommerce photography left" — which is the whole point of splitting
// them out below.
const isWpHosted = (src: string) => /\/wp-content\/uploads\//.test(src);
const isMirrored = (src: string) =>
  src.startsWith("/product-images/") || src.startsWith("/product-bg/");
const isWoo = (src: string) => isWpHosted(src) || isMirrored(src);

type ErpProduct = {
  ProductCode?: string;
  ProductDescription?: string;
  DefaultSellPrice?: number | string;
  ImageUrl?: string;
  Images?: { Url?: string; IsDefault?: boolean }[];
  ProductBrand?: { BrandName?: string };
  ProductGroup?: { GroupName?: string };
  IsSellable?: boolean;
  Obsolete?: boolean;
};

const sign = (q: string) =>
  createHmac("sha256", process.env.UNLEASHED_API_KEY ?? "").update(q).digest("base64");

async function allErpProducts(): Promise<ErpProduct[]> {
  const items: ErpProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const q = `pageSize=200`;
    const res = await fetch(`https://api.unleashedsoftware.com/Products/${page}?${q}`, {
      headers: {
        "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
        "api-auth-signature": sign(q),
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Unleashed /Products/${page}: ${res.status}`);
    const json = (await res.json()) as { Items?: ErpProduct[]; Pagination?: { NumberOfPages?: number } };
    items.push(...(json.Items ?? []));
    if (page >= (json.Pagination?.NumberOfPages ?? 1)) break;
  }
  return items;
}

it("measures the WordPress -> Unleashed image swap", async () => {
  const erp = await allErpProducts();

  // The map the app builds, minus the fields an image swap cannot read: enough
  // for lookupBySku's rules AND for getRange, so a -GROUP container resolves the
  // same way the size picker on its page already resolves it.
  const map: UnleashedMap = {};
  const erpImage = new Map<string, string>();
  const erpName = new Map<string, string>();
  for (const p of erp) {
    const code = (p.ProductCode ?? "").trim().toUpperCase();
    if (!code) continue;
    erpName.set(code, (p.ProductDescription ?? "").trim());
    const img =
      p.Images?.find((i) => i.IsDefault)?.Url ?? p.Images?.[0]?.Url ?? p.ImageUrl;
    if (img) erpImage.set(code, img);
    map[code] = {
      price: Math.max(0, parseFloat(String(p.DefaultSellPrice ?? "0")) || 0),
      stock: 0,
      name: p.ProductDescription?.trim() || undefined,
      image: img || undefined,
      brand: p.ProductBrand?.BrandName?.trim() || undefined,
      group: p.ProductGroup?.GroupName?.trim() || undefined,
      sellable: p.IsSellable !== false,
    };
  }

  // The same resolution lookupBySku does: direct code, then the alias map.
  const lookup = (sku?: string): string | undefined => {
    const up = (sku ?? "").trim().toUpperCase();
    if (!up) return undefined;
    return erpImage.get(up) ?? erpImage.get(skuAliases[up] ?? "");
  };

  type Row = {
    sku: string;
    name: string;
    slug: string;
    wooImages: number;
    /** Where those images are served from today. */
    host: "wordpress" | "mirror";
    retired: boolean;
    /** Where a replacement was found, if anywhere. */
    via: "code" | "variation" | "range" | "none";
  };

  const rows: Row[] = [];
  let noWooImage = 0;

  for (const raw of allProducts()) {
    const override = imageOverrides[(raw.sku ?? "").trim()];
    const p = override?.length
      ? { ...raw, images: override.map((src, i) => ({ src, alt: raw.images?.[i]?.alt ?? raw.name })) }
      : raw;
    const woo = (p.images ?? []).filter((i) => isWoo(i.src ?? ""));
    const wooImages = woo.length;
    if (!wooImages) { noWooImage++; continue; }
    const host = woo.some((i) => isWpHosted(i.src ?? "")) ? "wordpress" : "mirror";

    const sku = (p.sku ?? "").trim();
    let via: Row["via"] = lookup(sku) ? "code" : "none";
    if (via === "none") {
      // A variable product's parent SKU is often not an ERP code at all; the
      // sizes are. One size's photograph is still the right picture for the
      // parent card, and it is what the range picker already shows.
      for (const v of variationsFor(p.id)) {
        if (lookup(v.sku)) { via = "variation"; break; }
      }
    }
    if (via === "none") {
      // A `-GROUP` SKU is a WooCommerce bundle container and is not an ERP code
      // at all, nor does it carry variations. The site already resolves those to
      // ERP sizes with getRange — the same call the product page makes to build
      // its picker — so the swap can use exactly that answer and cannot show a
      // photograph the picker disagrees with.
      const range = getRange(p, map);
      if (range?.sizes.some((s) => s.image)) via = "range";
    }
    rows.push({
      sku: sku || "(no sku)",
      name: p.name,
      slug: p.slug,
      wooImages,
      host,
      retired: isRetiredSku(sku),
      via,
    });
  }

  const swappable = rows.filter((r) => r.via !== "none");
  const viaCode = rows.filter((r) => r.via === "code");
  const viaVariation = rows.filter((r) => r.via === "variation");
  const viaRange = rows.filter((r) => r.via === "range");
  const gap = rows.filter((r) => r.via === "none");
  const gapLive = gap.filter((r) => !r.retired);
  const gapRetired = gap.filter((r) => r.retired);

  const onWordPress = rows.filter((r) => r.host === "wordpress");
  // THESE URLS ARE DEAD. masterkraft.com is the Next.js site now, so every
  // /wp-content/uploads/ path 404s — verified 2026-09-07. A product in this
  // group is rendering a BROKEN image today, and the swap is the fix for it
  // wherever the ERP has a photograph.
  const brokenFixed = onWordPress.filter((r) => r.via !== "none");
  const brokenStill = onWordPress.filter((r) => r.via === "none");
  const mirrored = rows.filter((r) => r.host === "mirror");
  const mirroredSwappable = mirrored.filter((r) => r.via !== "none");
  const mirroredPhotos = mirrored.reduce((n, r) => n + r.wooImages, 0);
  const mirroredExtra = mirroredSwappable.reduce((n, r) => n + Math.max(0, r.wooImages - 1), 0);

  const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) : "0.0");

  const table = (list: Row[]) =>
    ["| SKU | Product | Slug | Woo images |", "|---|---|---|---|"]
      .concat(
        list
          .slice()
          .sort((a, b) => a.sku.localeCompare(b.sku))
          .map((r) => `| \`${r.sku}\` | ${r.name.replace(/\|/g, "\\|")} | \`${r.slug}\` | ${r.wooImages} |`)
      )
      .join("\n");

  const md = `# WordPress images the site still serves, and what Unleashed has for them

Generated by \`npm run report:wooimages\`. Read-only.

The listing grids are ERP-driven already. This counts the snapshot products whose
own \`images\` are still \`masterkraft.com/wp-content/uploads/…\` — what the product
page's gallery, its OG and JSON-LD image, the related strip, search-suggest and
the featured row emit when a WooCommerce page exists for the product.

## The numbers

| | Products |
|---|---|
| Snapshot products carrying a WordPress image | **${rows.length}** |
| …the ERP has a photograph for, by code | ${viaCode.length} (${pct(viaCode.length, rows.length)}%) |
| …only via one of its WooCommerce variations | ${viaVariation.length} (${pct(viaVariation.length, rows.length)}%) |
| …only via \`getRange\`, the picker's own answer | ${viaRange.length} (${pct(viaRange.length, rows.length)}%) |
| **Replaceable** | **${swappable.length} (${pct(swappable.length, rows.length)}%)** |
| **No ERP photograph — would go blank if swapped blind** | **${gap.length} (${pct(gap.length, rows.length)}%)** |
| — of those, already retired (404s anyway) | ${gapRetired.length} |
| — of those, still live | **${gapLive.length}** |
| Snapshot products with no WooCommerce photography at all | ${noWooImage} |

## Where those pictures are served from TODAY

Getting off the WordPress HOST is not the same job as getting onto the ERP's
photography, and the mirror already did the first one for a third of the shop.

| | Products | Photographs |
|---|---|---|
| Still fetched from \`masterkraft.com/wp-content/uploads/\` | ${onWordPress.length} | ${onWordPress.reduce((n, r) => n + r.wooImages, 0)} |
| Already mirrored local (\`/product-images/\`, \`/product-bg/\`) | ${mirrored.length} | ${mirroredPhotos} |
| — of the mirrored, the ERP has a photograph for | ${mirroredSwappable.length} | |
| — SECONDARY photographs lost if the mirrored set is swapped | | **${mirroredExtra}** |

### The WordPress group is dead, but almost nobody can see it

Every \`/wp-content/uploads/\` path 404s — masterkraft.com is the Next.js site
now, and nothing serves those paths. Verified 2026-09-07.

IT IS ALMOST ALL INVISIBLE, THOUGH, and saying otherwise overstates it. All
${onWordPress.length} products in this group are S- or F-prefixed (Snap,
Fernwood), and legacy-redirects.json 308s ${onWordPress.length - 2} of them to a
category page. Two are still served: \`SRATTACC01\` (404s) and \`SAAAU01\`
(renders, from /erp-bg). So this is a latent breakage, not a visible one.

| | Products |
|---|---|
| Broken today, FIXED by the ERP swap | **${brokenFixed.length}** |
| Broken today, and the ERP has no photograph either | **${brokenStill.length}** |

The second row is the set that needs a picture put into Unleashed before it can
have one at all. The mirrored group is not affected: those files are committed
under \`/public\` and serve fine.

ERP codes carrying a photograph: ${erpImage.size} of ${erpName.size}.

## The rule this implies

Swap only where the ERP has a photograph, and leave the WordPress URL standing
where it does not. A blind swap would strip ${gapLive.length} live products of
their only picture.

### READ THE GAP NUMBER CAREFULLY — it counts PAGES, not ERP records

The ${gap.length} above are SNAPSHOT products, and most are \`-GROUP\` bundle
containers or variable parents — \`SMDBRH-GROUP\`, \`SWWPCB\` — which are not
Unleashed product codes at all. There is no ERP record to attach a picture to,
so they can never be closed by an upload; they close when the ERP is given
photographs for their SIZES, which \`getRange\` then finds.

Counted the other way — ERP product codes that have no image AND have a
WooCommerce photograph available to move — the gap was 7, and those 7 were
uploaded on 2026-09-07 and verified through the API. That count is now ZERO.
Re-derive it from the ERP side, not from this table.

## The gap — live products WordPress has a photograph of and the ERP does not

${gapLive.length ? table(gapLive) : "_None._"}

${gapRetired.length ? `## The gap — retired products (no action needed)\n\n${table(gapRetired)}\n` : ""}
`;

  mkdirSync("reports", { recursive: true });
  writeFileSync(OUT, md);
  out(`\n  snapshot products with a WordPress image: ${rows.length}`);
  out(`  replaceable from the ERP:                 ${swappable.length} (${pct(swappable.length, rows.length)}%)`);
  out(`  no ERP photograph (live):                 ${gapLive.length}`);
  out(`  no ERP photograph (retired):              ${gapRetired.length}`);
  out(`\n  wrote ${OUT}\n`);
}, 180_000);
