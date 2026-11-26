// GRENKE LEASE FINANCE AT CHECKOUT (2026-11-23).
//
// An order over $5,000 ex GST can be financed through GRENKE: the buyer pays a
// 20% deposit by card at checkout, the order is placed, and the team arranges
// the GRENKE lease for the rest by phone (there is no GRENKE API). The checkout
// shows what the lease would cost, as a weekly figure over 60 months.
//
// THE RATES ARE GRENKE'S, not ours. Their formula: monthly repayment = amount
// financed ex GST × factor / 100. The factor is per term only, not per amount,
// on the rate card Michael pasted on 23 Nov 2026. GRENKE bills monthly or
// quarterly; weekly is a display conversion (monthly × 12 / 52). Change a rate
// here and every checkout figure, email and Unleashed comment follows.
//
// GRENKE leases to businesses only, so this is a business option.

export const FINANCE_THRESHOLD_EX_GST = 5000;
export const FINANCE_DEPOSIT_SHARE = 0.2;
export const FINANCE_TERM_MONTHS = 60;

/** GRENKE factor rates by term in months (rate card, 23 Nov 2026). */
export const GRENKE_FACTORS: Record<number, number> = {
  24: 4.658,
  36: 3.287,
  48: 2.605,
  60: 2.2,
};

const GST = 1.1;
const cents = (n: number) => Math.round(n * 100) / 100;

export type FinanceSplit = {
  /** The whole order, inc GST: goods less any promo, plus freight. */
  orderTotal: number;
  /** Charged by card today, inc GST. */
  deposit: number;
  /** Left for GRENKE to finance, inc GST. */
  balance: number;
  /** What GRENKE prices on: the balance ex GST. */
  financedExGst: number;
  termMonths: number;
  /** GRENKE's monthly repayment, ex GST. */
  monthly: number;
  /** The same repayment shown weekly, ex GST. */
  weekly: number;
};

/** Over the threshold, judged on the whole order ex GST (what GRENKE invoices). */
export function financeEligible(orderTotalIncGst: number): boolean {
  return Number.isFinite(orderTotalIncGst) && orderTotalIncGst / GST > FINANCE_THRESHOLD_EX_GST;
}

/**
 * The deposit, the balance and the repayment for an order. The deposit is
 * rounded to the cent and the balance is the remainder, so the two always add
 * up to the order total exactly. Null when the order is not eligible.
 */
export function financeSplit(orderTotalIncGst: number, termMonths = FINANCE_TERM_MONTHS): FinanceSplit | null {
  if (!financeEligible(orderTotalIncGst)) return null;
  const orderTotal = cents(orderTotalIncGst);
  const deposit = cents(orderTotal * FINANCE_DEPOSIT_SHARE);
  const balance = cents(orderTotal - deposit);
  const lease = leaseRepayment(balance, termMonths);
  return lease ? { orderTotal, deposit, balance, ...lease } : null;
}

/** GRENKE's repayment on an amount to be financed, given inc GST. */
export function leaseRepayment(
  balanceIncGst: number,
  termMonths = FINANCE_TERM_MONTHS
): Pick<FinanceSplit, "financedExGst" | "termMonths" | "monthly" | "weekly"> | null {
  const factor = GRENKE_FACTORS[termMonths];
  if (!factor || !(balanceIncGst > 0)) return null;
  const financedExGst = cents(balanceIncGst / GST);
  const monthly = cents((financedExGst * factor) / 100);
  const weekly = cents((monthly * 12) / 52);
  return { financedExGst, termMonths, monthly, weekly };
}

/** Written on the PaymentIntent by /api/payment-intent, on the server. */
export const FINANCE_PLAN = "grenke-60";

export function financeMetadata(split: FinanceSplit): Record<string, string> {
  return {
    finance_plan: FINANCE_PLAN,
    finance_order_total: split.orderTotal.toFixed(2),
    finance_deposit: split.deposit.toFixed(2),
    finance_balance: split.balance.toFixed(2),
    finance_weekly: split.weekly.toFixed(2),
  };
}

/** True when the intent is a GRENKE deposit rather than payment in full. */
export function isFinanceIntent(metadata: Record<string, string> | null | undefined): boolean {
  return metadata?.finance_plan === FINANCE_PLAN;
}

/** One line for the sales order's Comments, and the team email. */
export function financeComment(split: FinanceSplit): string {
  return (
    `GRENKE FINANCE: ${(FINANCE_DEPOSIT_SHARE * 100).toFixed(0)}% deposit ${split.deposit.toFixed(2)} inc GST paid by card. ` +
    `Balance ${split.balance.toFixed(2)} inc GST (${split.financedExGst.toFixed(2)} ex GST) to be financed by GRENKE over ` +
    `${split.termMonths} months, est. ${split.monthly.toFixed(2)}/month ex GST. Arrange the lease before dispatch.`
  );
}
