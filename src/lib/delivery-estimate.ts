// When an order should have arrived, for Google Customer Reviews.
//
// GOOGLE SURVEYS THE BUYER ON THIS DATE. Too early and the survey lands before
// the parcel does, and the buyer rates a delivery they have not had — the one
// mistake here that costs stars. Too late only delays a review. So every term
// below errs late: dispatch at the slow end of the policy's "48–72 hours", the
// slow end of each state's transit range, and the policy's own "extra day or
// two" for non-capital addresses added to everyone, since a postcode does not
// say which side of a metro boundary it is on.
//
// The transit ranges are the shipping policy's (legal-content.ts, "shipping");
// change them together.

const DISPATCH_BUSINESS_DAYS = 3;
const REGIONAL_ALLOWANCE_DAYS = 2;

// Upper bound of each state's stated transit time, in business days. TAS and
// ACT are not in the policy's table; they take their neighbours' worst case.
const TRANSIT_BUSINESS_DAYS: Record<string, number> = {
  VIC: 2,
  NSW: 3,
  ACT: 3,
  SA: 3,
  QLD: 4,
  TAS: 4,
  WA: 6,
  NT: 7,
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
  const transit = TRANSIT_BUSINESS_DAYS[state.trim().toUpperCase()] ?? UNKNOWN_STATE_DAYS;
  const d = addBusinessDays(ordered, DISPATCH_BUSINESS_DAYS + transit + REGIONAL_ALLOWANCE_DAYS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
