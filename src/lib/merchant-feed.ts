// The Google Merchant Center product feed.
//
// ONE ITEM PER ERP CODE, NOT PER PAGE. Merchant Center matches a shopper's
// query against an item, and "15kg competition bumper plate" is a code, not a
// range. A range published as one item advertises its cheapest size at the
// range's landing page and gets a price mismatch the moment Google reads the
// page for a different size. Sizes are tied back together with item_group_id,
// which is what lets Google show them as one product with variants.
//
// WHAT IS DELIBERATELY NOT IN HERE:
//
// - GTINs. Unleashed holds none, so every item carries brand + mpn and an
//   explicit `identifier_exists: no`. Sending a made-up GTIN is worse than
//   sending none: it matches somebody else's product.
// - `shipping`. Freight on this catalogue is quoted per address by a carrier
//   (see lib/freight-server.ts) and cannot be flattened into the per-country
//   rate the feed expects. `shipping_weight` goes out instead and the rates are
//   configured account-side in Merchant Center, which is where a carrier-rate
//   calculation belongs.
// - Out-of-stock and preorder items. Merchant Center accepts them; a campaign
//   budget should not. 162 of the 285 live products are PreOrder, and paying
//   for a click on one buys a customer a wait, not a sale.
import { erpUnits, unitAsProduct, unitDescription, codeIsShippable, brandDisplayName, type ErpUnit } from "@/lib/erp-catalogue";
import { lookupBySku, type UnleashedEntry, type UnleashedMap } from "@/lib/unleashed";
import { productBySlug } from "@/lib/catalogue";
import { decodeEntities } from "@/lib/woocommerce";
import { productCopy } from "@/lib/product-copy";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { FREIGHT_VERIFIED_SLUGS } from "@/lib/merchant-feed-allowlist";

export type FeedItem = {
  id: string;
  itemGroupId?: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  price: string;
  brand?: string;
  mpn: string;
  availability: "in_stock";
  condition: "new";
  googleProductCategory: string;
  productType: string;
  shippingWeightKg?: number;
  /** custom_label_0 — what a paid campaign filters on. See FREIGHT_VERIFIED_LABEL. */
  customLabel0: string;
};

/**
 * Why an ERP code did not make the feed. Returned rather than logged, so a
 * caller can show one list of reasons instead of being handed a feed that is
 * quietly shorter than the catalogue and no explanation of which rule ate what.
 */
export type FeedRejection = { code: string; unit: string; reason: string };

// Google's taxonomy, by ERP ProductGroup. Everything on this site sits under
// Sporting Goods > Exercise & Fitness, and the leaves below are the ones Google
// splits bids on.
//
// EVERY STRING HERE MUST BE A REAL NODE. Google matches the value against its
// published taxonomy exactly and rejects the item when it does not resolve —
// there is no fuzzy match and no partial credit. An unmapped group therefore
// falls back to the parent, which is always valid: a broad category costs some
// bidding precision, a wrong one costs the item.
//
// The mapping below is deliberately conservative for that reason. Before the
// first Merchant Center fetch, check each string against the current
// taxonomy file (google.com/basepages/producttype/taxonomy-with-ids.en-AU.txt)
// and switch to the numeric IDs, which are stable where the wording is not.
const EXERCISE_AND_FITNESS = "Sporting Goods > Exercise & Fitness";
const CATEGORY_BY_GROUP: Record<string, string> = {
  "Weightlifting": `${EXERCISE_AND_FITNESS} > Weightlifting > Weightlifting Bars`,
  "Weight Plates": `${EXERCISE_AND_FITNESS} > Weightlifting > Weight Plates`,
  "Dumbbells": `${EXERCISE_AND_FITNESS} > Weightlifting > Dumbbells`,
  "Kettlebells": `${EXERCISE_AND_FITNESS} > Weightlifting > Kettlebells`,
  "Barbells": `${EXERCISE_AND_FITNESS} > Weightlifting > Weightlifting Bars`,
  "Mixed Implements": `${EXERCISE_AND_FITNESS} > Exercise Balls`,
  // "Equipment Storage" and "Body Weight" have no leaf worth guessing at —
  // racks and mats do not map cleanly onto the weightlifting branch — so they
  // take the parent rather than a plausible-looking string that may not exist.
};

const GST_INCLUSIVE_CURRENCY = "AUD";

/** A price the way Merchant Center wants it: "129.00 AUD", GST included. */
export function feedPrice(value: number): string {
  return `${value.toFixed(2)} ${GST_INCLUSIVE_CURRENCY}`;
}

/**
 * THE NAME THE LANDING PAGE SHOWS, which is not always the ERP's.
 *
 * product/[slug]/page.tsx renders the WooCommerce snapshot's product when the
 * unit has one and falls back to unitAsProduct otherwise, so the snapshot's
 * name is what a shopper — and Google's landing-page check — actually reads.
 * The ERP calls MBRPMI01 "Mini Bands"; the page says "Micro Bands (Pack of 4)".
 * Advertising the ERP's name sends a shopper to a page that appears to be a
 * different product.
 */
export function displayName(unit: ErpUnit): string {
  const page = unit.wooSlug ? productBySlug(unit.wooSlug) : undefined;
  // The snapshot holds names HTML-encoded — "Rope &amp; Band Rack". Escaping
  // that for XML without decoding it first produces "&amp;amp;", and Merchant
  // Center advertises a product with a literal "&amp;" in its name. Same
  // decoder the category names go through; see woocommerce.ts.
  return page?.name ? decodeEntities(page.name).trim() : unit.name;
}

/**
 * The item's title. Merchant Center matches on it heavily, and the catalogue's
 * own names are written for a page that already says what brand it is and which
 * size picker it sits behind — "Change Plates" tells a shopper nothing and
 * competes with every other change plate in the country.
 *
 * So the title is rebuilt as brand + name + size, which is the shape a shopper
 * types. The brand is dropped when it is not a manufacturer we can name, rather
 * than padding the title with "NO BRAND".
 */
export function feedTitle(unit: ErpUnit, size: string | undefined): string {
  const brand = brandDisplayName(unit.brand);
  const name = displayName(unit);
  const parts = [brand, name, size].filter(Boolean);
  // 150 is the Merchant Center limit; Google truncates a Shopping ad well
  // before that, so the size — the part a shopper is choosing on — must never
  // be the half that falls off. It is last, and the NAME is what gets trimmed.
  const joined = parts.join(" ");
  if (joined.length <= 150) return joined;
  const tail = [brand, size].filter(Boolean).join(" ");
  return `${name.slice(0, Math.max(0, 149 - tail.length))} ${tail}`.trim();
}

function itemFor(
  unit: ErpUnit,
  code: string,
  size: string | undefined,
  entry: UnleashedEntry,
  isVerified: boolean,
): FeedItem {
  const copy = productCopy(unit.slug)?.short;
  const image = entry.image ?? unit.image ?? "";
  return {
    id: code,
    // Only a real range is grouped. A single-code unit given an item_group_id
    // becomes a one-variant group, which Merchant Center renders as a product
    // with a size picker holding one size.
    itemGroupId: unit.isRange ? unit.slug : undefined,
    title: feedTitle(unit, size),
    description: copy && copy.trim() ? copy.trim() : unitDescription(unit),
    link: `${SITE_URL}/product/${unit.slug}`,
    imageLink: absoluteUrl(image),
    price: feedPrice(entry.price),
    brand: brandDisplayName(unit.brand),
    mpn: code,
    availability: "in_stock",
    condition: "new",
    googleProductCategory: CATEGORY_BY_GROUP[unit.group] ?? EXERCISE_AND_FITNESS,
    productType: unit.subgroup ? `${unit.group} > ${unit.subgroup}` : unit.group,
    shippingWeightKg: entry.weightKg,
    customLabel0: isVerified ? FREIGHT_VERIFIED_LABEL : UNVERIFIED_LABEL,
  };
}

export type BuildOptions = {
  /**
   * Publish ONLY the freight-verified units, rather than everything eligible.
   *
   * THE FEED IS NOT WHERE SPEND IS CONTROLLED — a campaign is. Merchant Center
   * shows free listings from this feed at no cost, so narrowing it throws away
   * free traffic and the conversion data that decides whether paid is worth
   * starting. Every eligible product therefore ships, and the freight-verified
   * ones are TAGGED rather than filtered (see customLabel0), so a future paid
   * campaign can target exactly them with an inventory filter.
   *
   * This flag exists for the case where that reasoning stops holding — a
   * catalogue-wide disapproval, or a campaign structure that cannot filter.
   */
  verifiedOnly?: boolean;
};

/**
 * custom_label_0. The handle a paid campaign filters on.
 *
 * "freight-verified" means: priced at or below the market on 17 Sep 2026
 * against Verve Fitness and Little Bloke Fitness, and quoted for real parcel
 * freight. Everything else is eligible to be LISTED, which costs nothing, and
 * not yet cleared to be BID ON, which does.
 */
const FREIGHT_VERIFIED_LABEL = "freight-verified";
const UNVERIFIED_LABEL = "unverified";

/**
 * Build the feed. Pure: takes the ERP map, returns items plus the reason every
 * excluded code was excluded.
 */
export function buildFeed(
  map: UnleashedMap,
  opts: BuildOptions = {},
): { items: FeedItem[]; rejected: FeedRejection[] } {
  const items: FeedItem[] = [];
  const rejected: FeedRejection[] = [];
  const verified = FREIGHT_VERIFIED_SLUGS;

  for (const unit of erpUnits(map).values()) {
    const isVerified = verified.has(unit.slug);
    if (opts.verifiedOnly && !isVerified) {
      rejected.push({ code: unit.codes[0], unit: unit.slug, reason: "not freight-verified" });
      continue;
    }
    // unitAsProduct is how every other surface reads a unit; going through it
    // means a change to image or stock resolution reaches the feed too, instead
    // of the feed quietly advertising something the page no longer shows.
    const page = unitAsProduct(unit);
    if (!page.images.length && !unit.codes.some((c) => map[c.toUpperCase()]?.image)) {
      rejected.push({ code: unit.codes[0], unit: unit.slug, reason: "no image" });
      continue;
    }

    unit.codes.forEach((code, i) => {
      const entry = lookupBySku(map, code);
      if (!entry) {
        rejected.push({ code, unit: unit.slug, reason: "no ERP entry" });
        return;
      }
      // "Contact for pricing". It cannot reach card checkout, so it cannot be
      // the landing page for a Shopping click either.
      if (!(entry.price > 0)) {
        rejected.push({ code, unit: unit.slug, reason: "no price" });
        return;
      }
      if (!(entry.stock > 0)) {
        rejected.push({ code, unit: unit.slug, reason: "out of stock" });
        return;
      }
      // The same gate the site uses to decide a product can be bought at all.
      // A code that cannot be freight-quoted reaches checkout and stops there.
      if (!codeIsShippable(code, entry)) {
        rejected.push({ code, unit: unit.slug, reason: "freight not quotable" });
        return;
      }
      if (!entry.image && !unit.image) {
        rejected.push({ code, unit: unit.slug, reason: "no image" });
        return;
      }
      items.push(itemFor(unit, code, unit.sizes[i], entry, isVerified));
    });
  }

  items.sort((a, b) => a.id.localeCompare(b.id));
  return { items, rejected };
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function tag(name: string, value: string | number | undefined): string {
  if (value === undefined || value === "") return "";
  return `    <${name}>${xmlEscape(String(value))}</${name}>`;
}

/** RSS 2.0 with Google's namespace — the format Merchant Center fetches. */
export function feedToXml(items: FeedItem[], now = new Date()): string {
  const entries = items
    .map((it) =>
      [
        "  <item>",
        tag("g:id", it.id),
        tag("g:item_group_id", it.itemGroupId),
        tag("g:title", it.title),
        tag("g:description", it.description),
        tag("g:link", it.link),
        tag("g:image_link", it.imageLink),
        tag("g:availability", it.availability),
        tag("g:condition", it.condition),
        tag("g:price", it.price),
        tag("g:brand", it.brand),
        tag("g:mpn", it.mpn),
        // No GTIN exists anywhere in Unleashed. Saying so explicitly is what
        // stops Merchant Center holding the item for a missing identifier.
        tag("g:identifier_exists", "no"),
        tag("g:google_product_category", it.googleProductCategory),
        tag("g:product_type", it.productType),
        it.shippingWeightKg ? tag("g:shipping_weight", `${it.shippingWeightKg} kg`) : "",
        tag("g:custom_label_0", it.customLabel0),
        "  </item>",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    "    <title>MASTERKRAFT</title>",
    `    <link>${xmlEscape(SITE_URL)}</link>`,
    "    <description>Commercial gym equipment, shipped across Australia.</description>",
    `    <lastBuildDate>${now.toUTCString()}</lastBuildDate>`,
    entries,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
