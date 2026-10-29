// Promo codes at checkout. One code per order, a fixed amount off the goods.
//
// THE CODES LIVE HERE, IN THE REPO, not in a table. There is one (THANKS50, on
// the printed thank-you card) and adding the next is a reviewed change, which is
// what a code that takes money off an order should be.
//
// THE SERVER IS THE ONLY JUDGE. The checkout asks /api/promo/check so it can show
// the discount, but what is charged is decided again in /api/payment-intent from
// the repriced cart, and the amount it took off is written on the intent. The
// order is placed from THAT figure (lib/fulfil-order), never from the browser.
//
// ONE USE PER CUSTOMER is checked against Stripe, not a table of our own: every
// paid intent that used a code carries `promo_code` and `promo_email` in its
// metadata, and Stripe's search finds them. Nothing to migrate, and the record
// of who used a code is the record of who paid. Search lags new payments by
// about a minute, so two orders placed within a minute of each other could both
// get the code; that is $50, not a reason for a second store of state.
import { stripe } from "@/lib/stripe";

export type PromoCode = {
  code: string;
  /** Dollars off the goods, inc GST. Never more than the goods total. */
  amountOff: number;
  /** The goods total (inc GST, before freight) must be MORE than this. */
  minSpendOver: number;
  onePerCustomer: boolean;
  active: boolean;
};

// The card reads: "$50 off your next order. Spend over $200 and use code
// THANKS50 at checkout. One use per customer. Can't be combined with other
// offers." One code per order is how the last sentence is kept.
export const PROMO_CODES: Record<string, PromoCode> = {
  THANKS50: { code: "THANKS50", amountOff: 50, minSpendOver: 200, onePerCustomer: true, active: true },
};

export type AppliedPromo = { code: string; amount: number };

export type PromoVerdict =
  | { ok: true; promo: PromoCode; discount: number }
  | { ok: false; error: string };

const aud = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`;

/** "thanks 50 " -> "THANKS50". Codes are letters and digits only. */
export function normaliseCode(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 32) : "";
}

export function normaliseEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 200) : "";
}

/** Does this code apply to a cart whose goods total (inc GST) is `goodsTotal`? */
export function evaluatePromo(rawCode: unknown, goodsTotal: number): PromoVerdict {
  const code = normaliseCode(rawCode);
  const promo = PROMO_CODES[code];
  if (!code || !promo || !promo.active) return { ok: false, error: "That code isn't valid." };
  if (!(goodsTotal > promo.minSpendOver)) {
    return { ok: false, error: `${promo.code} needs a spend over ${aud(promo.minSpendOver)} before delivery.` };
  }
  const discount = Math.round(Math.min(promo.amountOff, goodsTotal) * 100) / 100;
  return { ok: true, promo, discount };
}

/**
 * Has this email already paid for an order with this code? Throws when Stripe
 * cannot answer, so the caller can refuse the code rather than guess.
 */
export async function alreadyRedeemed(code: string, rawEmail: string): Promise<boolean> {
  const email = normaliseEmail(rawEmail);
  if (!email) return false;
  if (!stripe) throw new Error("Payments not configured");
  // Search values are single-quoted; an email that could break out of the
  // quotes is not one we can look up, so it is treated as already used.
  if (/['\\]/.test(email)) return true;
  // Stripe search cannot mix AND with OR, so one query per status. Processing
  // covers an Afterpay or Zip payment still settling.
  const found = await Promise.all(
    ["succeeded", "processing"].map((status) =>
      stripe!.paymentIntents.search({
        query: `status:'${status}' AND metadata['promo_code']:'${code}' AND metadata['promo_email']:'${email}'`,
        limit: 1,
      })
    )
  );
  return found.some((r) => r.data.length > 0);
}

/** Written on the intent by /api/payment-intent. */
export function promoMetadata(applied: AppliedPromo, email: string): Record<string, string> {
  return {
    promo_code: applied.code,
    promo_amount: applied.amount.toFixed(2),
    promo_email: normaliseEmail(email),
  };
}

/** What an intent says was taken off, or null. Our server wrote it. */
export function promoFromMetadata(metadata: Record<string, string> | null | undefined): AppliedPromo | null {
  const code = metadata?.promo_code;
  const amount = Number(metadata?.promo_amount);
  if (!code || !Number.isFinite(amount) || amount <= 0) return null;
  return { code, amount: Math.round(amount * 100) / 100 };
}
