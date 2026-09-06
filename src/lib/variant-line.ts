// The one place a range's size becomes a cart line.
//
// There are now TWO ways to add a size — the picker's Add to Cart, and the ADD
// on each row of the size table — and they must produce byte-identical lines or
// the same dumbbell arrives in the cart twice under two keys. The rules below
// are subtle enough that a second copy would drift, so there is only this one.
import type { CartItem } from "@/components/cart/CartProvider";
import type { Variant } from "@/components/shop/VariantSelector";

export function variantLine(
  productName: string,
  productSlug: string,
  v: Variant
): Omit<CartItem, "qty"> {
  return {
    id: v.id,
    // 0 for a size the old store never listed. It no longer decides whether the
    // line can be paid for by card - the ERP code below does, since repricing
    // and order writing both go through the ERP now (lib/cart-eligibility). It
    // is kept because the snapshot is still the router for slugs and copy.
    productId: v.wooProductId ?? 0,
    variationId: v.wooVariationId,
    sku: v.code,
    slug: productSlug,
    name: `${productName} - ${v.label}`,
    image: v.image,
    price: v.priceValue,
  };
}
