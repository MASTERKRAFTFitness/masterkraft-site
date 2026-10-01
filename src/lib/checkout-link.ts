// Google Merchant Center's checkout link: /checkout?id={id}.
//
// Merchant Center substitutes `{id}` with the feed item's g:id, which is an ERP
// code (lib/merchant-feed.ts — one item per code, not per page). A shopper who
// clicks "Checkout" on a Google listing lands on our checkout expecting THAT
// item, in THAT size, already in the cart. This file turns the code back into
// the cart line the product page would have added.
//
// THE LINE MUST BE BYTE-IDENTICAL TO THE PRODUCT PAGE'S. The cart keys on `id`,
// so a line built here with a different key would put the same dumbbell in the
// cart twice the moment the shopper also clicks Add to Cart on the page. Range
// sizes therefore key exactly as product/[slug]/page.tsx keys them (the
// WooCommerce variation id, else the negated code hash), and single products key
// on unitAsProduct's id, which is what that page renders a single unit with.
import type { CartItem } from "@/components/cart/CartProvider";
import { codeIsShippable, erpUnits, unitAsProduct } from "@/lib/erp-catalogue";
import { displayName } from "@/lib/merchant-feed";
import { sizesFromCodes } from "@/lib/ranges";
import { lookupBySku, type UnleashedMap } from "@/lib/unleashed";

// Stable positive hash of an ERP code, negated for use as a cart key. Sizes the
// old store never listed have no WooCommerce variation id, and the cart keys on
// a number; a negative one can never collide with a real WooCommerce id.
export function hashCode(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

export type CheckoutLine = Omit<CartItem, "qty">;

/**
 * The cart line for an ERP code, or null when the code cannot be bought by card
 * right now. The same gates as the feed: a price, stock, and a carton freight
 * can be quoted for. A link that lands on a checkout which then refuses the item
 * is worse than one that lands on an empty cart with the product a click away.
 */
export function cartLineForCode(map: UnleashedMap, rawCode: string): CheckoutLine | null {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const entry = lookupBySku(map, code);
  if (!entry || !(entry.price > 0) || !(entry.stock > 0) || !codeIsShippable(code, entry)) {
    return null;
  }

  for (const unit of erpUnits(map).values()) {
    if (!unit.codes.some((c) => c.toUpperCase() === code)) continue;
    const name = displayName(unit);

    if (unit.isRange) {
      const size = sizesFromCodes(unit.codes, map).find((s) => s.code.toUpperCase() === code);
      if (!size) return null;
      // Same shape as lib/variant-line.ts.
      return {
        id: size.wooVariationId ?? -hashCode(size.code),
        productId: size.wooProductId ?? 0,
        variationId: size.wooVariationId,
        sku: size.code,
        slug: unit.slug,
        name: `${name} - ${size.label}`,
        image: size.image ?? unit.image,
        price: size.price,
      };
    }

    const product = unitAsProduct(unit);
    return {
      id: product.id,
      productId: product.id,
      sku: unit.codes[0],
      slug: unit.slug,
      name,
      image: entry.image ?? unit.image,
      price: entry.price,
    };
  }
  return null;
}
