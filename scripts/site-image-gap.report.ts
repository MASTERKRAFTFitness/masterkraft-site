// Products the site sells that have no photograph in Unleashed.
//
//   npm run report:siteimages
//     reports/site-image-gap.csv   one row per ERP code
//     reports/site-image-gap.md    the same thing to read
//
// WHY THIS IS NOT report:shootlist. That one answers "how many THINGS must go in
// front of a camera", so it collapses codes into products and scopes itself to
// the site's own brands. This answers the narrower question: which ERP codes the
// WEBSITE ACTUALLY SERVES have no ERP photograph, and — the part that matters —
// what a visitor sees on the page today instead.
//
// "ON THE WEBSITE" IS servedCodes(), NOT a prefix rule. The site sells from two
// places and a code counts if either one reaches it: an ErpUnit built from
// Unleashed (the listing grids), or a surviving snapshot page whose range
// resolves to it. Guessing from the code prefix gets both halves wrong — it
// keeps A-prefixed clearance stock that IS on sale out, and lets M-prefixed
// codes that no unit and no page reaches in.
//
// WHAT THE VISITOR SEES IS RESOLVED THE WAY THE ROUTE RESOLVES IT: BY SLUG, and
// the snapshot first. `app/product/[slug]` calls getProductBySlug(slug) and only
// falls back to erpUnitBySlug when that misses, so an ErpUnit whose slug a
// snapshot page already owns renders the SNAPSHOT product, photographs and all.
//
// Two earlier cuts of this file got that wrong in opposite directions and both
// were caught against production rather than by reading:
//
//   Hand-rolling the precedence reported `/product/high-grip-dead-ball-4` as
//   showing /product-images/MMDEHG-2.jpg. It serves an Unleashed CDN photograph:
//   the page resolves its gallery through getRange, which is NOT the ErpUnit's
//   grouping, so a sibling the unit had dropped still reaches the page.
//
//   Matching pages to codes via pageCodes() then called eleven pages blank that
//   are not — `/product/eva-exercise-mat-set-of-10` and
//   `/product/performance-indoor-cycle` among them — because the unit behind the
//   code shares a slug with a snapshot page that pageCodes could not connect it
//   to. Resolving the slug is what connects them.
//
// THE CARD AND THE PAGE ARE REPORTED SEPARATELY for that reason. A listing grid
// draws ErpUnits, so it shows `unit.image` and can be blank while the page the
// card opens is fully photographed.
//
// A MISSING ERP IMAGE IS NOT THE SAME AS A BLANK PAGE, and reporting them as one
// number is what makes this list unusable. Four things can happen:
//
//   blank            nothing anywhere. The card renders empty.
//   dead-wordpress   the only picture is a wp-content URL on a host that has
//                    been 404ing since 1 Sep. Renders BROKEN, which is worse
//                    than blank, and no report has counted these.
//   sibling-size     a photographed size in the same range carries the card, so
//                    the hole is only inside the size picker. Includes the sizes
//                    the ErpUnit dropped but getRange still finds.
//   snapshot-photo   the old WooCommerce photograph, rehosted into /public.
//                    The page looks finished; only the ERP record is bare.
//
// WHAT COUNTS AS THE ERP HAVING ONE: entry.image, which is already
// erp-image-overrides.json ?? the default Image ?? Images[0] ?? ImageUrl — the
// same expression buildMap uses, so a repainted /erp-bg/ backdrop counts as the
// ERP's photograph here exactly as it does on the site. Restating the fallback
// chain differently would report ~214 repainted products as gaps.
//
// SUPABASE IS READ TOO, because product_images is the only thing that can give a
// `-GROUP` container a picture and it would otherwise be invisible here. Read
// over REST rather than through getGallery(), which is wrapped in unstable_cache
// and returns {} outside a Next request. Fails soft: no credentials means no
// extra angles, which is the same answer the site degrades to.
//
// A RETIRED TWIN MAY ALREADY HOLD THE PHOTOGRAPH. Apparel was re-coded at some
// point — `MAACU02-L` became `MAACU02L` — and the picture stayed on the retired
// code, which is also why four `/erp-bg/` overrides are keyed to codes the live
// catalogue no longer contains and have never fired. So this takes a SECOND pass
// with includeObsolete=true and reports, per gap, whether the photograph is
// already sitting on a punctuation-variant of the same code.
//
// REPORTED IN TWO TIERS, because the squashed code alone is a known trap:
// `MWWPOU-10` is a 2.5 kg 3-grip plate and `MWWPOU10` is a 15 kg 4-grip plate,
// and squashing punctuation out merges them. So:
//
//   confirmed  squashed code matches AND the ProductDescription is identical.
//              Same product, safe to act on without looking.
//   candidate  squashed code matches, description does not. BOTH descriptions
//              are printed and a person decides. This tier is not noise — it is
//              where the four hoodies live, renamed "Oversized Hoodie (L)" to
//              "Oversized Hoodie (Unisex) (L)" when they were re-coded — and it
//              is also where MWWPOU-10 would land, correctly, as a thing to
//              reject rather than a match to trust.
//
// HIDE_UNSHIPPABLE IS FORCED ON, and getting this wrong is worth more than every
// other rule in here put together. `.env.local` does not set it, Vercel
// Production does, and `erpUnits` drops an unmeasured code when it is on — so
// running this with the local environment as-is reported 176 gaps where the
// deployed site has 119. All 57 of the difference are pages that 404 in
// production: `/product/micro-bands`, `/product/retail-rack` and the rest were
// spot-checked and every one is gone. Set it to "false" deliberately to see what
// the site WOULD show if the measurements landed; leave it alone to describe the
// site as it stands.
//
// It fetches Unleashed directly rather than through getUnleashedMap(), for the
// same unstable_cache reason.
//
// VERIFIED AGAINST PRODUCTION, 16 Sep 2026: all 51 slugs in the blank bucket and
// all 16 in the sibling bucket, and every one agreed.
//
// CHECK og:image, NOT THE <img> TAGS. Counting every image on the rendered page
// called 29 of the blanks wrong, because a product page also draws a
// related-products strip and those cards carry OTHER products' photographs —
// `/product/olympic-half-rack-2-0` serves three Unleashed CDN images and has no
// photograph of its own. generateMetadata sets og:image from the resolved
// product alone, so it is empty exactly when the page has no picture:
//
//   curl -s https://masterkraft.com/product/<slug> |
//     grep -oE '<meta property="og:image"[^>]*content="[^"]*"'
//
// Read-only. It measures; it changes nothing.
import crypto from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { it } from "vitest";

const env = new Map<string, string>();
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
}
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;
// Production's value, not the local one. See the header.
if (process.env.HIDE_UNSHIPPABLE === undefined) process.env.HIDE_UNSHIPPABLE = "true";
const HIDING = process.env.HIDE_UNSHIPPABLE === "true";

const { getAllProducts, getAllProductsByCategory, getProductBySlug, isBrandSku } = await import(
  "@/lib/woocommerce"
);
const { erpUnits, pageCodes, servedCodes, splitUnitName, unitAsProduct } = await import(
  "@/lib/erp-catalogue"
);
const { withErpImages } = await import("@/lib/unleashed");
const { getCategory } = await import("@/lib/categories");
const erpImageOverrides = (await import("@/lib/erp-image-overrides.json")).default as Record<
  string,
  string
>;
type UnleashedMap = import("@/lib/unleashed").UnleashedMap;
type WcProduct = import("@/lib/woocommerce").WcProduct;

const CSV = "reports/site-image-gap.csv";
const MD = "reports/site-image-gap.md";
const GST = 1.1;

type Raw = {
  ProductCode?: string;
  DefaultSellPrice?: number | string;
  ProductDescription?: string;
  ImageUrl?: string;
  Images?: { Url?: string; IsDefault?: boolean }[];
  ProductBrand?: { BrandName?: string };
  ProductGroup?: { GroupName?: string };
  ProductSubGroup?: { GroupName?: string };
  IsSellable?: boolean;
  Obsolete?: boolean;
};

const sign = (q: string) =>
  crypto.createHmac("sha256", env.get("UNLEASHED_API_KEY") ?? "").update(q).digest("base64");

async function erpPages<T>(path: string, extra = ""): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= 30; page++) {
    const q = extra ? `${extra}&pageSize=200` : "pageSize=200";
    const res = await fetch(`https://api.unleashedsoftware.com/${path}/${page}?${q}`, {
      headers: {
        "api-auth-id": env.get("UNLEASHED_API_ID") ?? "",
        "api-auth-signature": sign(q),
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });
    if (!res.ok) throw new Error(`Unleashed ${res.status} on ${path}/${page}`);
    const j = (await res.json()) as { Items?: T[]; Pagination?: { NumberOfPages?: number } };
    items.push(...(j.Items ?? []));
    if (page >= (j.Pagination?.NumberOfPages ?? 1)) break;
  }
  return items;
}

/** product_images, keyed by ERP code. Empty on any failure, like getGallery. */
async function supabaseGallery(): Promise<Record<string, string[]>> {
  const url = env.get("SUPABASE_URL");
  const key = env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return {};
  try {
    const res = await fetch(`${url}/rest/v1/product_images?select=erp_code,images`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return {};
    const rows = (await res.json()) as { erp_code?: string; images?: string[] }[];
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      const code = String(r.erp_code ?? "").trim().toUpperCase();
      const imgs = (r.images ?? []).filter((s) => typeof s === "string" && s.startsWith("/"));
      if (code && imgs.length) out[code] = imgs;
    }
    return out;
  } catch {
    return {};
  }
}

const isWordPress = (src?: string) => !!src && /\/wp-content\/uploads\//.test(src);

type Verdict = "blank" | "dead-wordpress" | "sibling-size" | "snapshot-photo";

type Row = {
  verdict: Verdict;
  code: string;
  name: string;
  product: string;
  brand: string;
  group: string;
  subgroup: string;
  price: number;
  stock: number;
  reachedBy: string;
  slug: string;
  familyShot: number;
  familySize: number;
  showing: string;
  /** The listing grid draws ErpUnits, so a card can be blank while its page is not. */
  blankCard: boolean;
  /** A punctuation-variant of this code that IS photographed. */
  photoOnCode: string;
  /** "confirmed" when the descriptions match too, "candidate" when they differ. */
  twinTier: "" | "confirmed" | "candidate";
  /** The twin's own description, so a candidate can be judged without a lookup. */
  twinName: string;
  /** "retired" — copy the image across. "live" — the ERP holds the product TWICE. */
  twinState: "" | "retired" | "live";
};

it("lists the served ERP codes with no photograph", async () => {
  const [products, withRetired, soh, gallery] = await Promise.all([
    erpPages<Raw>("Products"),
    erpPages<Raw>("Products", "includeObsolete=true"),
    erpPages<{ ProductCode?: string; AvailableQty?: number; QtyOnHand?: number }>("StockOnHand"),
    supabaseGallery(),
  ]);

  // buildMap's own normalisation, including the image fallback chain. Keep these
  // two in step: a divergence here reports products as unphotographed that the
  // site shows a picture for.
  const map: UnleashedMap = {};
  for (const p of products) {
    if (!p.ProductCode) continue;
    const code = p.ProductCode.toUpperCase();
    const price = parseFloat(String(p.DefaultSellPrice ?? "0"));
    const image =
      erpImageOverrides[code] ??
      p.Images?.find((i) => i.IsDefault)?.Url ??
      p.Images?.[0]?.Url ??
      p.ImageUrl;
    map[code] = {
      price: price > 0 ? Math.round(price * GST * 100) / 100 : 0,
      stock: 0,
      name: p.ProductDescription?.trim() || undefined,
      image: image || undefined,
      brand: p.ProductBrand?.BrandName?.trim() || undefined,
      group: p.ProductGroup?.GroupName?.trim() || undefined,
      subgroup: p.ProductSubGroup?.GroupName?.trim() || undefined,
      sellable: p.IsSellable !== false,
    };
  }
  for (const s of soh) {
    const code = (s.ProductCode ?? "").toUpperCase();
    if (!code) continue;
    const qty = Number(s.AvailableQty ?? s.QtyOnHand ?? 0);
    if (map[code]) map[code].stock = qty;
    else map[code] = { price: 0, stock: qty };
  }

  // Every code the ERP holds, retired ones included, that carries a photograph.
  // Keyed by punctuation-squashed code + normalised description, so a variant is
  // only offered when it is demonstrably the same product. See the header.
  const squash = (s: string) => s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const photographedTwin = new Map<string, { code: string; name: string; live: boolean }[]>();
  for (const p of withRetired) {
    const code = (p.ProductCode ?? "").trim();
    if (!code) continue;
    const img =
      erpImageOverrides[code.toUpperCase()] ??
      p.Images?.find((i) => i.IsDefault)?.Url ??
      p.Images?.[0]?.Url ??
      p.ImageUrl;
    if (!img) continue;
    const bucketed = photographedTwin.get(squash(code));
    const rec = {
      code,
      name: (p.ProductDescription ?? "").trim(),
      // A photographed twin that is ITSELF still sellable is not a place to copy
      // an image from — it means the ERP holds the same product under two live
      // codes and the site builds a card for each, one of them blank. Retiring
      // the duplicate is the fix; copying the picture would entrench it.
      live: p.Obsolete !== true && p.IsSellable !== false,
    };
    if (bucketed) bucketed.push(rec);
    else photographedTwin.set(squash(code), [rec]);
  }

  // The two halves of the site, and which one reaches each code.
  const units = erpUnits(map);
  const unitOf = new Map<string, ReturnType<typeof erpUnits> extends Map<string, infer U> ? U : never>();
  for (const unit of units.values()) for (const c of unit.codes) unitOf.set(c.toUpperCase(), unit);

  const clearanceId = getCategory("clearance")?.wcId;
  const pages: WcProduct[] = [
    ...(await getAllProducts()),
    ...(clearanceId ? await getAllProductsByCategory(clearanceId, { brandFilter: false }) : []),
  ];
  const pageOf = new Map<string, WcProduct>();
  for (const page of pages) {
    if (!isBrandSku(page.sku) && !(page.categories ?? []).some((c) => c.slug === "clearance"))
      continue;
    for (const c of pageCodes(page, map)) if (!pageOf.has(c)) pageOf.set(c, page);
  }

  // Memoised: several codes in a range resolve to the same slug.
  const slugCache = new Map<string, WcProduct | null>();
  const bySlug = async (slug: string) => {
    if (!slugCache.has(slug)) slugCache.set(slug, await getProductBySlug(slug).catch(() => null));
    return slugCache.get(slug) ?? null;
  };

  const served = servedCodes(map);
  const rows: Row[] = [];

  for (const code of served) {
    const entry = map[code];
    if (!entry || entry.image) continue;

    const unit = unitOf.get(code);
    const page = pageOf.get(code);
    const family = unit?.codes.map((c) => c.toUpperCase()) ?? [code];
    const familyShot = family.filter((c) => map[c]?.image).length;

    // WHAT THE VISITOR ACTUALLY SEES. The route's own order: the snapshot page
    // for this slug if there is one, otherwise the unit. Never restated — see
    // the header for the two ways restating it went wrong.
    const slug = unit?.slug ?? page?.slug ?? "";
    const woo = slug ? await bySlug(slug) : null;
    const resolved = woo
      ? withErpImages(woo, map, gallery)
      : unit
        ? unitAsProduct(unit)
        : undefined;
    const shown = resolved?.images?.[0]?.src;

    // The card in the listing grid, which is the unit's own picture.
    const blankCard = !unit?.image;

    const isErpPhoto =
      !!shown && !isWordPress(shown) && !/^\/(product-images|product-bg)\//.test(shown);

    let verdict: Verdict;
    let showing: string;
    if (!shown) {
      verdict = "blank";
      showing = "";
    } else if (isWordPress(shown)) {
      verdict = "dead-wordpress";
      showing = shown;
    } else if (isErpPhoto) {
      verdict = "sibling-size";
      showing = shown;
    } else {
      verdict = "snapshot-photo";
      showing = shown;
    }

    // Prefer an exact description match; fall back to the squashed-code match as
    // a candidate for a person to confirm. Never silently treat the second as
    // the first — that is the MWWPOU-10 trap.
    const twins = (photographedTwin.get(squash(code)) ?? []).filter(
      (t) => t.code.toUpperCase() !== code
    );
    const exact = twins.find((t) => norm(t.name) === norm(entry.name ?? ""));
    const twin = exact ?? twins[0];

    rows.push({
      verdict,
      code,
      name: entry.name ?? "",
      product:
        unit?.name ?? (splitUnitName(entry.name ?? "", entry.brand).name || (entry.name ?? "")),
      brand: entry.brand ?? "",
      group: entry.group ?? "",
      subgroup: entry.subgroup ?? "",
      price: entry.price,
      stock: entry.stock,
      reachedBy: unit && page ? "unit+page" : unit ? "unit" : "page",
      slug: unit?.slug ?? page?.slug ?? "",
      familyShot,
      familySize: family.length,
      showing,
      blankCard,
      photoOnCode: twin?.code ?? "",
      twinTier: twin ? (exact ? "confirmed" : "candidate") : "",
      twinName: twin?.name ?? "",
      twinState: twin ? (twin.live ? "live" : "retired") : "",
    });
  }

  // Broken pictures first — they are live damage, not absent work — then blanks,
  // then the two cosmetic buckets. Stable within a bucket so two runs of the
  // same data produce the same file.
  const order: Record<Verdict, number> = {
    "dead-wordpress": 0,
    blank: 1,
    "sibling-size": 2,
    "snapshot-photo": 3,
  };
  rows.sort(
    (a, b) =>
      order[a.verdict] - order[b.verdict] ||
      a.group.localeCompare(b.group) ||
      a.product.localeCompare(b.product) ||
      a.code.localeCompare(b.code)
  );

  mkdirSync("reports", { recursive: true });
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  writeFileSync(
    CSV,
    [
      "verdict,code,erp_name,product,brand,group,sub_group,price_inc_gst,stock,reached_by,slug,family_photographed,family_size,showing_instead,blank_card,photo_on_other_code,photo_match,other_code_state,photo_on_other_name",
      ...rows.map((r) =>
        [
          r.verdict,
          r.code,
          r.name,
          r.product,
          r.brand,
          r.group,
          r.subgroup,
          r.price ? r.price.toFixed(2) : "",
          String(r.stock),
          r.reachedBy,
          r.slug,
          String(r.familyShot),
          String(r.familySize),
          r.showing,
          r.blankCard ? "yes" : "",
          r.photoOnCode,
          r.twinTier,
          r.twinState,
          r.twinName,
        ]
          .map(esc)
          .join(",")
      ),
    ].join("\n") + "\n"
  );

  const bucket = (v: Verdict) => rows.filter((r) => r.verdict === v);
  const byGroup = (list: Row[]) => {
    const m = new Map<string, Row[]>();
    for (const r of list) {
      const g = m.get(r.group || "(no group)");
      if (g) g.push(r);
      else m.set(r.group || "(no group)", [r]);
    }
    return [...m].sort((a, b) => b[1].length - a[1].length);
  };
  const table = (list: Row[]) => [
    "| code | product | brand | price | stock | photo already on |",
    "|---|---|---|---:|---:|---|",
    ...list.map(
      (r) =>
        `| \`${r.code}\` | ${r.name || r.product} | ${r.brand} | ${
          r.price ? "$" + r.price.toFixed(2) : "—"
        } | ${r.stock} | ${r.photoOnCode ? "`" + r.photoOnCode + "`" : "—"} |`
    ),
    "",
  ];

  const broken = bucket("dead-wordpress");
  const blank = bucket("blank");
  const sibling = bucket("sibling-size");
  const snapshot = bucket("snapshot-photo");
  const retiredTwins = rows.filter((r) => r.twinState === "retired");
  const liveTwins = rows.filter((r) => r.twinState === "live");
  const twinned = [...retiredTwins, ...liveTwins];
  const inErp = Object.values(map).filter((e) => e.sellable !== false).length;

  const md = [
    "# Served products with no photograph in Unleashed",
    "",
    `Generated by \`npm run report:siteimages\`. Every row is in \`${CSV}\`.`,
    "",
    `**${rows.length} of the ${served.size} ERP codes the website serves have no photograph on`,
    `their Unleashed record.** Only ${broken.length + blank.length} of them look wrong to a visitor.`,
    "",
    "| | |",
    "|---|---:|",
    `| Sellable, non-obsolete codes in Unleashed | ${inErp} |`,
    `| …that the website actually serves | ${served.size} |`,
    ...(HIDING
      ? []
      : [
          "| | |",
          "| ⚠️ **HIDE_UNSHIPPABLE=false** — this run counts pages production does NOT serve | |",
        ]),
    `| …with no photograph on the ERP record | **${rows.length}** |`,
    "",
    "## What a visitor sees today",
    "",
    "| | | |",
    "|---|---:|---|",
    `| **Broken picture** — only a dead \`wp-content\` URL | **${broken.length}** | fix first |`,
    `| **Blank** — nothing anywhere | **${blank.length}** | needs a photograph |`,
    `| Covered by a photographed size in the same range | ${sibling.length} | picker rows only |`,
    `| Covered by rehosted WooCommerce photography | ${snapshot.length} | ERP record only |`,
    "",
    `## ${twinned.length} of them do not need a camera — the photograph already exists`,
    "",
    "In each case a **punctuation-variant of the same code** carries the picture. What to do",
    "about it depends entirely on whether that other code is retired or still live, and they",
    "are opposite jobs.",
    "",
    `### ${retiredTwins.length} where the photographed code is RETIRED — copy the image across`,
    "",
    "The product was re-coded and the picture stayed behind on the old record. Copying it onto",
    "the live code in the Unleashed UI is the whole fix.",
    "",
    "| live code | live description | photographed code | its description | match |",
    "|---|---|---|---|---|",
    ...(retiredTwins.length
      ? retiredTwins.map(
          (r) =>
            `| \`${r.code}\` | ${r.name} | \`${r.photoOnCode}\` | ${r.twinName} | ${r.twinTier} |`
        )
      : ["| — | none | — | — | — |"]),
    "",
    `### ${liveTwins.length} where the photographed code is STILL LIVE — a duplicate record`,
    "",
    "**Do not copy the image onto these.** Unleashed holds the same product under two sellable",
    "codes that differ only by a stray space, and `erpUnits` keys on the NAME, so the two",
    "descriptions build two separate cards — one photographed, one blank. Copying the picture",
    "across would leave the shop listing the same product twice, both looking finished.",
    "Retiring the spaced duplicate in the ERP removes the blank card and the double listing",
    "together.",
    "",
    "| duplicate (blank) | its description | real code (photographed) | its description |",
    "|---|---|---|---|",
    ...(liveTwins.length
      ? liveTwins.map(
          (r) => `| \`${r.code}\` | ${r.name} | \`${r.photoOnCode}\` | ${r.twinName} |`
        )
      : ["| — | none | — | — |"]),
    "",
    "### Four `/erp-bg/` overrides have never fired",
    "",
    "`erp-image-overrides.json` keys repainted backdrops to `MAACU02-L`, `MAACU02-M`,",
    "`MAACU02-S` and `MAACU02-XL`. The live catalogue holds those codes without the hyphen, so",
    "`buildMap` never looks them up and the files sit in `public/erp-bg/` unused. Re-keying them",
    "to the live codes photographs four of the rows above without touching Unleashed at all.",
    "",
    "A squashed-code match on its own is the `MWWPOU-10` trap — that code is a 2.5 kg 3-grip",
    "plate and `MWWPOU10` is a 15 kg 4-grip plate — so both descriptions are printed above and",
    "`match` says whether they were identical (`confirmed`) or merely a re-wording",
    "(`candidate`, worth an eye before acting).",
    "",
    `## Broken — ${broken.length} codes pointing at the dead WordPress host`,
    "",
    "`shop.masterkraft.com` has 404'd on everything since 1 September, so these render as a",
    "broken image rather than an empty one. The photograph exists; it is the URL that is dead.",
    "",
    ...(broken.length ? byGroup(broken).flatMap(([g, l]) => [`### ${g} (${l.length})`, "", ...table(l)]) : ["None.", ""]),
    `## Blank — ${blank.length} codes with no photograph anywhere`,
    "",
    "No ERP image, no sibling size, no Supabase row, no snapshot page. These are the cards",
    "that render empty, and the only bucket that needs a camera.",
    "",
    ...(blank.length ? byGroup(blank).flatMap(([g, l]) => [`### ${g} (${l.length})`, "", ...table(l)]) : ["None.", ""]),
    `## Covered by a sibling size — ${sibling.length} codes`,
    "",
    "The card and the product page both show a photographed size from the same range, so the",
    "gap is only visible inside the size picker.",
    "",
    "| code | product | brand | group | family photographed |",
    "|---|---|---|---|---:|",
    ...sibling.map(
      (r) => `| \`${r.code}\` | ${r.product} | ${r.brand} | ${r.group} | ${r.familyShot}/${r.familySize} |`
    ),
    "",
    `## Covered by rehosted WooCommerce photography — ${snapshot.length} codes`,
    "",
    "The page looks finished. Only the Unleashed record is bare, which matters for the",
    "franchisee portal and for anything else reading the ERP rather than the site.",
    "",
    "| code | product | brand | group | showing |",
    "|---|---|---|---|---|",
    ...snapshot.map((r) => `| \`${r.code}\` | ${r.product} | ${r.brand} | ${r.group} | ${r.showing} |`),
    "",
    "## How a code got here",
    "",
    "`servedCodes()` — the ERP codes reachable from either half of the site: an `ErpUnit` built",
    "from Unleashed, or a surviving snapshot page whose range resolves to it. Then dropped if",
    "`entry.image` resolves, which is `erp-image-overrides.json ?? Images[IsDefault] ??",
    "Images[0] ?? ImageUrl` — the same chain `buildMap` uses, so a repainted `/erp-bg/`",
    "backdrop counts as photographed here exactly as it does on the site.",
    "",
    "Uploading is manual: the Unleashed API cannot write images. `npm run report:photoupload`",
    "stages the ones that already have a file to move; `npm run report:shootlist` collapses the",
    "blanks into the products a shoot has to cover.",
    "",
  ];
  writeFileSync(MD, md.join("\n"));

  console.log(`HIDE_UNSHIPPABLE=${HIDING} (production sets it true)`);
  console.log(`served codes: ${served.size}, no ERP photograph: ${rows.length}`);
  console.log(`  dead-wordpress  ${broken.length}`);
  console.log(`  blank           ${blank.length}`);
  console.log(`  sibling-size    ${sibling.length}`);
  console.log(`  snapshot-photo  ${snapshot.length}`);
  console.log(`  of which the photo already exists on a retired twin: ${twinned.length}`);
}, 180000);
