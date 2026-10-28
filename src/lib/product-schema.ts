// Product structured data for a RANGE: one ProductGroup with one Product per
// size, which is Google's documented shape for variants.
//
// IT REPLACES AN AggregateOffer. That told Google a range was one product at
// "$5.00–$225.00, 24 offers", so a crawl of the page could not confirm the
// price of any single size the Merchant feed sent (one item per ERP code), and
// the products Google found by crawling were listed as families. Each variant
// here carries the same code, price and URL as its feed item, and
// productGroupID is the feed's item_group_id (the unit's slug).
import { productUrl } from "@/lib/site";

export type SchemaVariant = {
  code: string;
  /** "4kg", "L". Becomes the variant's `size`. */
  label: string;
  /** GST-inclusive. A size with no price is left out: an Offer needs one. */
  priceValue: number;
  /** Melbourne stock. Anything else can be ordered but waits: BackOrder. */
  inStock: boolean;
  image?: string;
};

export function offerAvailability(inStock: boolean): string {
  // BackOrder, not PreOrder: the product exists and is waiting on stock. The
  // Merchant feed says "backorder" for the same codes, and Google compares them.
  return inStock ? "https://schema.org/InStock" : "https://schema.org/BackOrder";
}

export function productGroupSchema(opts: {
  slug: string;
  name: string;
  description?: string;
  images: string[];
  brand?: string;
  variants: SchemaVariant[];
  priceValidUntil: string;
  returnPolicy: unknown;
}): Record<string, unknown> | null {
  const priced = opts.variants.filter((v) => v.priceValue > 0);
  if (!priced.length) return null;
  const brand = opts.brand ? { brand: { "@type": "Brand", name: opts.brand } } : {};
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    name: opts.name,
    description: opts.description,
    image: opts.images,
    url: productUrl(opts.slug),
    productGroupID: opts.slug,
    variesBy: "https://schema.org/size",
    ...brand,
    hasVariant: priced.map((v) => ({
      "@type": "Product",
      name: `${opts.name} ${v.label}`,
      sku: v.code,
      // The ERP's own code is the manufacturer part number for the ranges we
      // make; there are no GTINs in Unleashed to offer alongside it.
      mpn: v.code,
      size: v.label,
      image: v.image ? [v.image] : opts.images.slice(0, 1),
      ...brand,
      offers: {
        "@type": "Offer",
        url: productUrl(opts.slug, v.code),
        priceCurrency: "AUD",
        price: v.priceValue.toFixed(2),
        priceValidUntil: opts.priceValidUntil,
        availability: offerAvailability(v.inStock),
        itemCondition: "https://schema.org/NewCondition",
        hasMerchantReturnPolicy: opts.returnPolicy,
      },
    })),
  };
}
