// Everything needed to turn a PaymentIntent into an order, written ON the intent.
//
// A card payment finishes on our page, so the browser still holds the cart and
// the address and posts them to /api/order. Afterpay and Zip do not: the
// customer leaves for the provider's site and comes back to /checkout/complete,
// or does not come back at all and only Stripe's webhook knows they paid. In
// both cases the only record of what was bought is whatever the intent carries.
//
// So /api/payment-intent writes the cart refs and the buyer's details into the
// intent's metadata when it creates it - on the SERVER, from the same refs it
// priced - and the order is placed from that. Stripe caps a metadata value at
// 500 characters and an object at 50 keys, which is why both are split across
// numbered keys (cart_0, cart_1, ...) rather than stored as one value.
import type { CartRef, OrderAddress } from "@/lib/order-lines";

const CHUNK = 500;
// Room for the freight keys, the order keys written after placing, and these.
const MAX_CHUNKS = 12;

/** Split one string across `prefix_0..n`. Throws rather than truncating. */
export function chunked(prefix: string, value: string): Record<string, string> {
  const out: Record<string, string> = {};
  const count = Math.ceil(value.length / CHUNK);
  if (count > MAX_CHUNKS) throw new Error(`${prefix} is too large to store on the payment`);
  for (let i = 0; i < count; i++) out[`${prefix}_${i}`] = value.slice(i * CHUNK, (i + 1) * CHUNK);
  return out;
}

/** The inverse of chunked(): every `prefix_n`, joined in order. Empty when absent. */
export function unchunked(metadata: Record<string, string> | null | undefined, prefix: string): string {
  const m = metadata ?? {};
  let out = "";
  for (let i = 0; i < MAX_CHUNKS && m[`${prefix}_${i}`] !== undefined; i++) out += m[`${prefix}_${i}`];
  return out;
}

// One ref per line as productId|variationId|quantity|sku. A pipe or semicolon in
// a ProductCode would break that, so those are refused rather than stored wrong.
function packRef(r: CartRef): string {
  const sku = r.sku ?? "";
  if (/[|;]/.test(sku)) throw new Error(`Unstorable product code ${sku}`);
  return [r.productId, r.variationId ?? "", r.quantity, sku].join("|");
}

function unpackRef(s: string): CartRef | null {
  const [productId, variationId, quantity, sku] = s.split("|");
  const ref: CartRef = { productId: Number(productId), quantity: Number(quantity) };
  if (!Number.isFinite(ref.productId) || !Number.isFinite(ref.quantity) || ref.quantity <= 0) return null;
  if (variationId) ref.variationId = Number(variationId);
  if (sku) ref.sku = sku;
  return ref;
}

const BILLING_KEYS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "company",
  "address_1",
  "city",
  "state",
  "postcode",
  "country",
] as const;

export type OrderIntentData = {
  items: CartRef[];
  billing: OrderAddress;
  checkoutId?: string;
  anonId?: string;
};

/** The metadata /api/payment-intent adds to the intent it creates. */
export function orderIntentMetadata(data: OrderIntentData): Record<string, string> {
  const billing: Record<string, string> = {};
  for (const k of BILLING_KEYS) {
    const v = data.billing[k];
    if (typeof v === "string" && v.trim()) billing[k] = v.trim().slice(0, 200);
  }
  return {
    ...chunked("cart", data.items.map(packRef).join(";")),
    ...chunked("billing", JSON.stringify(billing)),
    ...(data.checkoutId ? { checkout_id: data.checkoutId.slice(0, 64) } : {}),
    ...(data.anonId ? { anon_id: data.anonId.slice(0, 200) } : {}),
  };
}

/**
 * What an intent says was bought and by whom, or null when it carries no cart.
 * Null is the normal answer for an intent created before this shipped: those
 * only ever become orders from the browser, which sends the cart itself.
 */
export function orderIntentData(metadata: Record<string, string> | null | undefined): OrderIntentData | null {
  const cart = unchunked(metadata, "cart");
  if (!cart) return null;
  const items = cart.split(";").map(unpackRef);
  if (items.some((i) => i === null)) return null;

  let billing: OrderAddress = {};
  try {
    const parsed = JSON.parse(unchunked(metadata, "billing") || "{}");
    for (const k of BILLING_KEYS) if (typeof parsed?.[k] === "string") billing = { ...billing, [k]: parsed[k] };
  } catch {
    return null;
  }
  if (!billing.email) return null;

  return {
    items: items as CartRef[],
    billing,
    checkoutId: metadata?.checkout_id || undefined,
    anonId: metadata?.anon_id || undefined,
  };
}
