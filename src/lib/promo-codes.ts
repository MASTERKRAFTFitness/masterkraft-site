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
  /**
   * Codes in one group share the one-use rule: a customer who has used any of
   * them has had their discount. The thank-you codes are one offer at three
   * sizes, not three offers.
   */
  group?: string;
};

// THANKS50 is the first printed card: "$50 off your next order. Spend over $200
// and use code THANKS50 at checkout. One use per customer. Can't be combined with
// other offers." It stays live for cards already sent. From 29 Oct the card
// offers THANKYOU20 ($20 off over $200) or THANKYOU50 ($50 off over $500)
// instead (Michael). One code per order is how "not combined" is kept, and the
// shared group is how "one use per customer" survives there being three codes.
export const PROMO_CODES: Record<string, PromoCode> = {
  THANKS50: { code: "THANKS50", amountOff: 50, minSpendOver: 200, onePerCustomer: true, active: true, group: "thank-you" },
  THANKYOU20: { code: "THANKYOU20", amountOff: 20, minSpendOver: 200, onePerCustomer: true, active: true, group: "thank-you" },
  THANKYOU50: { code: "THANKYOU50", amountOff: 50, minSpendOver: 500, onePerCustomer: true, active: true, group: "thank-you" },
};

/** The codes a redemption of `code` counts against: its group, or itself. */
export function codesSharingUse(code: string): string[] {
  const group = PROMO_CODES[code]?.group;
  return group ? Object.values(PROMO_CODES).filter((p) => p.group === group).map((p) => p.code) : [code];
}

/** What the customer is told when the one-use rule refuses a code. */
export function alreadyUsedMessage(promo: PromoCode): string {
  return codesSharingUse(promo.code).length > 1
    ? `${promo.code} can't be used: this email has already had a thank-you discount.`
    : `${promo.code} has already been used with this email.`;
}

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
 * Has this email already paid for an order with this code, or with any code in
 * its group? Throws when Stripe cannot answer, so the caller can refuse the
 * code rather than guess.
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
    codesSharingUse(code).flatMap((c) =>
      ["succeeded", "processing"].map((status) =>
        stripe!.paymentIntents.search({
          query: `status:'${status}' AND metadata['promo_code']:'${c}' AND metadata['promo_email']:'${email}'`,
          limit: 1,
        })
      )
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
