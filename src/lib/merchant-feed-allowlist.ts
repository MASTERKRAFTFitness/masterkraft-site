// Which units may be advertised.
//
// THIS IS A SPEND DECISION, NOT A CATALOGUE ONE. Every unit here is live,
// in stock, photographed and freight-quotable — but so are others that are not
// here. The filter is competitive: each of these was priced against the full
// public catalogues of Verve Fitness (452 products) and Little Bloke Fitness
// (1,010) on 17 Sep 2026 and came back at or below the market rate, and each
// was then quoted for real freight through /api/freight/quote to Melbourne,
// Sydney and Perth.
//
// THE FREIGHT BAND IS THE REASON THIS LIST IS 26 AND NOT 40. Fourteen more
// products are priced at or below market and are excluded on freight class:
//
//   Bulky parcel ($35–65 to Melbourne, tripling interstate) — modular storage
//   rack shelf and side, EZ curl bar, vertical bumper plate rack, rig crossbeam,
//   fitness ball storage rack. Worth advertising to Victoria; not worth it to
//   Perth, and the feed has no way to say that. Geographic targeting in the Ads
//   account is the right tool, so add them when the campaign is split by state.
//
//   Pallet ($150–390 to Melbourne) — vertical dumbbell rack, high grip dead
//   ball, rig universal upright, kettlebell rack, barbell set rack, plyo box,
//   power rack 3.0. Three of them quote at exactly $151.77 to Melbourne, which
//   is the carrier's bulky minimum rather than a measurement. Competitors pay
//   the same floor, so the price advantage is real; what is doubtful is a
//   shopper completing a checkout that adds $150+ at the last step. These belong
//   in the quote funnel.
//
//   Quote-only — the functional trainer, where the freight router answers
//   `too_expensive` and refuses a parcel rate outright.
//
// ONE ENTRY WAS REMOVED AFTER THE FEED WAS BUILT, and the reason is the sort of
// thing a name-matched price comparison produces. `group-fitness-barbell-set-17-5kg`
// scored −70% against a $500 competitor barbell, on a unit whose cheapest size
// is $8 — the $8 is a component of a set, not a comparable product, and the
// match was junk. Building the feed surfaced it a second way: the only size of
// that unit still in stock and measurable is the 37.5kg at $295, and it lands on
// a page named for the 17.5kg set, so the item and its landing page disagree.
// Either fault alone is enough to keep it out.
//
// HOW TO CHANGE IT. Re-run the comparison before adding anything: a competitor
// price cut turns a winner into paid traffic to somebody else's cheaper product,
// and nothing in the app notices. Removing an entry is always safe.
//
// The comment on each line is its price position against the market and its
// Melbourne freight, as measured on 17 Sep 2026.

export const FREIGHT_VERIFIED_SLUGS = new Set<string>([
  "exercise-mat-hanging-rack-wall-mounted", // −74% · $10.10
  "rope-band-rack-wall-mounted-small", // −71% · $10.10
  "rope-band-rack-wall-mounted", // −67% · $10.10
  "bench-rower-rack-wall-mounted", // −64% · $11.48
  "change-plates", // −64% · $10.10
  "dead-ball-2", // −64% · $12.43
  "battle-rope-storage-wall-mounted", // −63% · $10.10
  "coloured-bumper-plates", // −56% · $14.35
  "olympic-bar-easy-lock-collars-pair-3", // −50% · $10.10
  "olympic-urethane-weight-plates-3", // −47% · $12.76
  "barbell-squat-pad-3", // −43% · $10.10
  "competition-bumper-plates-3", // −39% · $14.35
  "olympic-premium-rubber-weight-plates-2", // −36% · $12.76
  "gymnastic-rings-wooden-2", // −35% · $10.10
  "dip-pull-up-belt-2", // −32% · $10.10
  "medicine-ball-2", // −25% · $11.48
  "rig-core-trainer-landmine", // −24% · $10.10
  "rig-spotter-arms-pair", // −18% · $15.31
  "competition-kettlebells", // −14% · $15.31
  "knitted-resistance-bands-set-of-3", // −14% · $10.10
  "digital-interval-timer", // −10% · $10.10
  "foam-roller-v", // −8% · $11.80
  "micro-bands-pack-of-4", // at market · $10.10
  "speed-rope-elite", // at market · $10.10
  "wall-ball-armatex", // +6% · $13.41
]);
