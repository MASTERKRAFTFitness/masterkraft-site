// The returns policy, as the numbers Google reads.
//
// GOOGLE SCORES IT. Merchant Center's store quality rating weighs the return
// window and who pays for the return, and it reads them from three places: the
// /returns page, the account's Returns settings, and the MerchantReturnPolicy
// on each product page. A disagreement between any two is a policy warning, so
// the page text is tested against these constants (return-policy.test.ts) and
// the account setting has to be typed in to match by hand.
//
// 14 DAYS, CUSTOMER PAYS RETURN POSTAGE. Google's benchmark is 30 days and
// free returns; both were considered on 28 Sep 2026 and declined, so this
// scores below the benchmark on returns by choice. Raising it means changing
// the /returns text, this number and the Merchant Center setting together.
export const RETURN_WINDOW_DAYS = 14;

/** schema.org MerchantReturnPolicy for an Offer's `hasMerchantReturnPolicy`. */
export function merchantReturnPolicy() {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "AU",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_WINDOW_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
  };
}
