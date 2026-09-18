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
import { decodeEntities, plainText } from "@/lib/woocommerce";
import { resolveCopy, type ContentMap } from "@/lib/product-content";
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

// Google's product taxonomy, as NUMERIC IDs rather than path strings.
//
// THE STRINGS WERE WRONG AND WOULD HAVE COST 34 ITEMS. An earlier version of
// this map guessed paths like "Weightlifting > Weightlifting Bars", "Weight
// Plates", "Dumbbells" and "Kettlebells". Validated against Google's published
// taxonomy (google.com/basepages/producttype/taxonomy-with-ids.en-AU.txt), NONE
// of those nodes exist — Google files all of them under "Free Weights" and
// "Free Weight Accessories". A value that does not resolve EXACTLY is rejected,
// with no fuzzy match and no partial credit, so those 34 items would simply
// have been refused. Re-validate against that file before editing this map.
//
// IDs, not paths, because the id is stable when Google rewords a node — and
// because a typo in an id fails loudly rather than looking plausible.
//
// KEYED ON "Group > Subgroup" FIRST. The ERP's subgroup is far more precise
// than its group: "Mixed Implements" alone spans kettlebells, medicine balls,
// sleds and battle ropes, which belong in four different places.
const EXERCISE_AND_FITNESS = "990"; // Sporting Goods > Exercise & Fitness
const CATEGORY_BY_SUBGROUP: Record<string, string> = {
  // Weightlifting
  "Weightlifting > Weight Plates": "3164", // Free Weights
  "Mixed Implements > Kettlebells": "3164",
  "Mixed Implements > Dumbbells": "3164",
  "Weightlifting > Barbells": "3271", // Free Weight Accessories > Weight Bars
  "Weightlifting > Weightlifting Accessories": "6452", // Free Weight Accessories
  // Storage. Google files gym storage under the weightlifting branch, which is
  // not where you would look for it, but it is the only node that fits.
  "Equipment Storage > Freestanding": "8083", // Free Weight Storage Racks
  "Equipment Storage > Wall Mounted": "8083",
  // Racks, rigs and the machines that hang off them
  "Rigs & Racks > Squat & Power Racks": "3542", // Weightlifting Machines & Racks
  "Strength > Cable Machines": "3542",
  "Rigs & Racks > Attachments": "3217", // Weightlifting Machine & Bench Accessories
  "Strength > Weight Benches": "499795", // Exercise Benches
  // Balls
  "Mixed Implements > Medicine Balls": "3938", // Medicine Balls
  "Mixed Implements > Wall Balls": "3938",
  "Mixed Implements > Dead Balls": "3938",
  // Everything else with an honest leaf
  "Body Weight > Resistance & Power Bands": "5869", // Exercise Bands
  "Body Weight > Recovery & Mobility": "5319", // Foam Rollers
  "Body Weight > Balance & Stability": "499796", // Balance Trainers
  "Body Weight > Exercise Mats": "4669", // Exercise Equipment Mats
  "Flooring > Rubber Flooring": "4669",
  "Cardio > Treadmills": "997", // Cardio Machines > Treadmills
  "Cardio > Ski Trainer": "4589", // Cardio Machines
};
// Subgroups deliberately absent above — Group Fitness, Core Training, Speed &
// Agility, Plyometric Boxes, Gymnastics, Battle Ropes, Power Bags, Sleds — hold
// products Google has no node for, or a mix that one node would misrepresent.
// They take the parent, which always resolves. A broad category costs a little
// ranking precision; a wrong one misfiles the product against the wrong
// competitors, which is worse.

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

/**
 * THE DESCRIPTION THE LANDING PAGE SHOWS, resolved the same way the page
 * resolves it: database row, then product-copy.json, then the WooCommerce
 * snapshot, then the generated string as a last resort.
 *
 * READING ONLY product-copy.json WAS A BUG, and an expensive one to leave in:
 * 118 of the feed's 127 items shipped "Buy X at MASTERKRAFT. $20.00 inc. GST."
 * while their own page served real copy from the snapshot. It reads as missing
 * content, which is what nearly sent someone off to write seventy descriptions
 * that already existed. The snapshot is where most of this catalogue's words
 * live — product-copy.json covers 170 slugs, the snapshot covers far more.
 *
 * The snapshot field is HTML, so it goes through plainText; Merchant Center
 * wants prose, and markup in a description is a disapproval.
 */
function descriptionFor(unit: ErpUnit, content: ContentMap | undefined): string {
  const resolved = resolveCopy(unit.slug, content ?? {});
  // Keyed on unit.slug — the slug `link` points at — rather than wooSlug. They
  // are the same string whenever a snapshot page exists (erpUnits sets both
  // from page.slug), and for an ERP-only unit the lookup simply misses. Using
  // the slug we advertise is what guarantees the description belongs to the
  // page the shopper lands on.
  const snapshot = productBySlug(unit.slug)?.short_description;
  const text = plainText(resolved.short ?? "") || plainText(snapshot ?? "");
  // 5000 is Merchant Center's limit. Nothing in this catalogue is close, but a
  // description that silently overruns is rejected rather than truncated.
  return (text || unitDescription(unit)).slice(0, 5000);
}

/** The taxonomy id for a unit: subgroup first, then the always-valid parent. */
export function googleCategory(unit: ErpUnit): string {
  const key = unit.subgroup ? `${unit.group} > ${unit.subgroup}` : unit.group;
  return CATEGORY_BY_SUBGROUP[key] ?? EXERCISE_AND_FITNESS;
}

function itemFor(
  unit: ErpUnit,
  code: string,
  size: string | undefined,
  entry: UnleashedEntry,
  isVerified: boolean,
  content: ContentMap | undefined,
): FeedItem {
  const image = entry.image ?? unit.image ?? "";
  return {
    id: code,
    // Only a real range is grouped. A single-code unit given an item_group_id
    // becomes a one-variant group, which Merchant Center renders as a product
    // with a size picker holding one size.
    itemGroupId: unit.isRange ? unit.slug : undefined,
    title: feedTitle(unit, size),
    description: descriptionFor(unit, content),
    link: `${SITE_URL}/product/${unit.slug}`,
    imageLink: absoluteUrl(image),
    price: feedPrice(entry.price),
    brand: brandDisplayName(unit.brand),
    mpn: code,
    availability: "in_stock",
    condition: "new",
    googleProductCategory: googleCategory(unit),
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
  /**
   * The product_content map from getProductContent(). Supplying it makes the
   * feed's descriptions match the page exactly, including an editor's override;
   * omitting it falls back to the JSON and the snapshot, which is what the page
   * shows when the table is empty. Passed in rather than fetched so buildFeed
   * stays synchronous and testable.
   */
  content?: ContentMap;
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
      items.push(itemFor(unit, code, unit.sizes[i], entry, isVerified, opts.content));
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
