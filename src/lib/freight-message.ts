// What the customer is told when freight cannot be priced automatically.
//
// SHARED BY THE SERVER AND THE CHECKOUT FORM, and that is the point. The
// checkout now quotes freight in its own step before payment, so this sentence
// is reached from two places: the quote step in StripeCheckout, and the 422 out
// of /api/payment-intent when a card payment is attempted anyway. Two copies of
// this wording is how the two ends drift apart and the customer sees a different
// explanation depending on which button they pressed.
//
// Say WHY the order needs a quote. Most rejections here are not the customer's
// address failing - they are a rack or a machine, which ships as freight rather
// than parcel post and always did. Telling a Sydney customer we could not price
// "this delivery address" for a 250kg machine sends them off to re-check a
// postcode that was never the problem.
export function freightMessage(reason?: string): string {
  switch (reason) {
    case "oversize":
    case "too_many_parcels":
    // Deliberately the SAME sentence as oversize. From the customer's side both
    // mean "this is freight, not a parcel, and a person will price it" - and the
    // alternative is telling them their delivery is too expensive to sell them,
    // which is true, useless, and reads as a rebuke.
    case "too_expensive":
    // ALSO the same sentence, and this one matters most (Michael, 2026-09-06).
    // It used to say "we don't have shipping dimensions on file", which tells a
    // customer about OUR record-keeping and invites the obvious question. It is
    // also the wrong frame: only items above the enquiry threshold reach checkout
    // unmeasured - the under-$500 ones are hidden - so in practice these are
    // racks, trainers and machines that ship as freight and were always going to
    // be priced by a person. That is what the customer needs to know, and it is
    // true whether or not anybody has measured the carton.
    case "incomplete_dimensions":
      return "This order ships as freight rather than parcel post, so we price delivery per order. Request a quote and our team will confirm the cost with you.";
    case "no_delivery_address":
      return "Please enter your delivery suburb and postcode so we can calculate freight.";
    default:
      return "We couldn't calculate freight for this order right now. Please request a quote and our team will confirm it.";
  }
}
