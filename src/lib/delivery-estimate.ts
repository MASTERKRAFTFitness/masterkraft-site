// Expected delivery: the one table of dispatch and transit times.
//
// THREE THINGS READ IT AND MUST AGREE. The /shipping page states it to buyers
// (legal-content.ts, "shipping" - held to this table by delivery-estimate.test.ts),
// Merchant Center's shipping settings are typed in from it by hand, and Google
// Customer Reviews surveys the buyer on the date estimatedDeliveryDate() works
// out from it. Google measures real deliveries against what the account claims,
// and that measurement is part of the store quality score.
//
// ERRING LATE is deliberate everywhere it matters. The survey date takes the
// slow end of every range plus the regional allowance, because a survey that
// lands before the parcel does gets a rating for a delivery that has not
// happened. Too late only delays a review.

/** Business days from payment to handover to the carrier. */
export const DISPATCH_BUSINESS_DAYS = { min: 1, max: 3 };

/** Extra business days for an address outside a capital city. */
export const REGIONAL_ALLOWANCE_DAYS = 2;

/** Business days in transit after dispatch, by state, to the capital city. */
export const TRANSIT_BUSINESS_DAYS: Record<string, { city: string; min: number; max: number }> = {
  VIC: { city: "Melbourne", min: 1, max: 2 },
  NSW: { city: "Sydney", min: 2, max: 3 },
  ACT: { city: "Canberra", min: 2, max: 3 },
  SA: { city: "Adelaide", min: 2, max: 3 },
  QLD: { city: "Brisbane", min: 3, max: 4 },
  TAS: { city: "Hobart", min: 3, max: 4 },
  WA: { city: "Perth", min: 4, max: 6 },
  NT: { city: "Darwin", min: 5, max: 7 },
};
const UNKNOWN_STATE_DAYS = 7;

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return d;
}

/** YYYY-MM-DD, the format the survey opt-in requires. */
export function estimatedDeliveryDate(state: string, ordered: Date = new Date()): string {
  const transit = TRANSIT_BUSINESS_DAYS[state.trim().toUpperCase()]?.max ?? UNKNOWN_STATE_DAYS;
  const d = addBusinessDays(ordered, DISPATCH_BUSINESS_DAYS.max + transit + REGIONAL_ALLOWANCE_DAYS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
