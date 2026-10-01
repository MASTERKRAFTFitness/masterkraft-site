// The returns policy, as the numbers Google reads.
//
// GOOGLE SCORES IT. Merchant Center's store quality rating weighs the return
// window and who pays for the return, and it reads them from three places: the
// /returns page, the account's Returns settings, and the MerchantReturnPolicy
// on each product page. A disagreement between any two is a policy warning, so
// the page text is tested against these constants (return-policy.test.ts) and
// the account setting has to be typed in to match by hand.
//
// 30 DAYS, REFUND TO THE ORIGINAL PAYMENT, NO RESTOCKING FEE (decided 1 Oct
// 2026, replacing 14 days, store credit and a 20% restocking fee). Items must
// come back new and resellable. The customer still pays return postage, which
// is the one place this sits below Google's benchmark of free returns. Changing
// any of it means changing the /returns text, these values and the Merchant
// Center setting together.
export const RETURN_WINDOW_DAYS = 30;

/** schema.org MerchantReturnPolicy for an Offer's `hasMerchantReturnPolicy`. */
export function merchantReturnPolicy() {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "AU",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_WINDOW_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
    refundType: "https://schema.org/FullRefund",
    itemCondition: "https://schema.org/NewCondition",
  };
}
