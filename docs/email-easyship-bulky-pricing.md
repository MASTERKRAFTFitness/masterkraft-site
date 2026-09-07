# Email to Easyship — bulky pricing and the volumetric divisor

**Draft. Not sent.** Review, adjust the tone, send under your own name.

**Why this email and not a general complaint.** The single number that decides
whether Easyship works for this catalogue is the **volumetric divisor**, and it is
not published anywhere in their pricing. Everything else follows from it. So the
email asks that one question directly, evidences it with a real quote, and gives
them a fair chance to answer before any conclusion is drawn.

Figures come from the live account on 2026-09-06 and from
`docs/easyship-evaluation.md`.

---

**Subject:** Volumetric pricing on oversized domestic freight — MasterKraft (AU)

Hello,

We are integrating Easyship for MasterKraft, an Australian commercial gym
equipment supplier shipping from Thomastown VIC. Our API integration is working
well and the rating and booking flow has been straightforward to build.

Before we route live orders through it I would like to understand your oversized
pricing, because the quotes we are seeing do not work for our catalogue.

**A representative consignment.** One roll of artificial turf, 43kg actual,
200 x 45 x 45cm, Thomastown VIC 3074 to Novar Gardens SA 5040:

| | |
|---|---|
| Shipping cost | A$157.48 |
| Oversized surcharge | A$248.50 |
| GST | A$40.60 |
| **Total** | **A$446.58** |
| Chargeable weight | 101.25kg (volumetric) |

Two things we would like to understand:

1. **The oversized surcharge is 61% of the pre-tax cost.** Is that a fixed fee per
   consignment, a banded charge, or proportional to the dimensions? Is it
   negotiable at volume, and does it apply per consignment or per carton?

2. **The chargeable weight implies a divisor of 250kg per cubic metre.** Please
   confirm that figure, whether it varies by courier or service, and whether a
   better divisor is available on a paid plan or with a negotiated rate.

**Why the divisor matters more than the rate to us.** Our catalogue is commercial
gym equipment: racks, rigs and storage that are large, light and mostly air.
Measured across our range, 38 of 107 oversized products would bill on volume
rather than actual weight, at an average of 1.41 times their real weight. At the
extreme, a 16kg medicine ball rack bills as 175kg. A better rate on a divisor
that treats a 16kg rack as 175kg does not help us; a better divisor would.

**For context on where we need to land.** We have shipped this class of
consignment on the same lane for around A$145 through our existing carriers. We
are not expecting to match that through a reseller, but the current gap is too
wide for us to put oversized items through an online checkout.

Three smaller questions while I have you:

3. Your quote carries the remark "additional handling fees may occur for the
   oversize & DG shipment". **What is the realistic range of those fees, and at
   what point are they assessed?** We charge the customer at checkout, so any
   post-dispatch adjustment is absorbed by us rather than recovered. If rates are
   not final at the point of quoting, we need to know the likely spread.

4. **Is there a tailgate or two-person delivery option** on your Australian
   domestic services? A number of our deliveries go to sites with no dock and no
   forklift, and we did not see a way to declare that at rating time.

5. **Can we connect our own Australia Post account** to the platform, so their
   rates appear alongside yours? We currently rate Australia Post directly and it
   is materially cheaper on light parcels, but we would prefer one dispatch and
   tracking workflow if we can keep those rates.

Happy to jump on a call if that is easier.

Kind regards,

Michael Wines
MasterKraft

---

## Before sending

- [ ] Decide whether to include the A$145 comparison. It is honest and it frames
      the gap, but it also tells them your walk-away number. Cut it if you would
      rather not.
- [ ] The catalogue statistics (38 of 107, 1.41x, the 16kg rack) are real and
      regenerable, and they are what makes this a specific question rather than a
      complaint. Keep them.
- [ ] Question 5 is worth asking regardless of the pricing answer — connecting the
      Australia Post account inside Easyship is the version of "one platform" that
      does not cost us the light-parcel rates.
- [ ] Send from an address you monitor; the site has no public email address.
