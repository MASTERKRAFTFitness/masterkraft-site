// Where each advertised size wins on LANDED price: product plus delivery.
//
// THE RULE (MasterKraft, 5 Oct 2026): ad spend goes only where the shopper's
// total cost beats Little Bloke Fitness, the main benchmark. Product price alone
// was the 17 Sep test (see merchant-feed-allowlist.ts), and it was not enough:
// Little Bloke charges a flat $23.10 to Melbourne for a parcel against our
// $10–15, but they are cheaper to Perth on most of the range, so a product can
// win in one state and lose in another.
//
// HOW IT WAS MEASURED, on 5 Oct 2026. Each size was matched to Little Bloke's
// closest product, and both stores were quoted to Melbourne 3000, Sydney 2000
// and Perth 6000: ours through /api/freight/quote, theirs through their own
// checkout shipping calculator. Plates are compared as a pair against two of
// ours, because they sell plates in pairs and we sell them singly. A size wins
// in a city when its landed total is lower than theirs; a tie is a loss.
//
// Only sizes of units still in FREIGHT_VERIFIED_SLUGS are listed. A size listed
// with no regions lost everywhere; a size of an advertised unit that is NOT
// listed had no Little Bloke equivalent to measure against (the urethane plates,
// the 6kg and 18kg kettlebells, the wall racks), so it keeps the product-price
// advantage it was admitted on.
//
// RE-RUN IT MONTHLY. A Little Bloke price cut or delivery change turns a winner
// into paid traffic for their cheaper product, and nothing here notices.

export type Region = "vic" | "nsw" | "wa";

export const LANDED_PRICE_WINS: Record<string, Region[]> = {
  // All three cities
  MBRMRL03: ["vic", "nsw", "wa"], // 33cm foam roller, +$37 to +$42
  MEWMACC02: ["vic", "nsw", "wa"], // rope & band rack, +$38 to +$44
  MEWMACC01: ["vic", "nsw", "wa"], // rope & band rack (small), +$48 to +$54
  MMMBPR01: ["vic", "nsw", "wa"], // medicine ball 2kg, +$8 to +$13
  MMMBPR02: ["vic", "nsw", "wa"], // medicine ball 4kg, +$5 to +$13
  MRCTATT01: ["vic", "nsw", "wa"], // landmine, +$41 to +$49
  MWWLACC01: ["vic", "nsw", "wa"], // squat pad, +$18 to +$23
  // Melbourne and Sydney; Little Bloke is cheaper delivered to Perth
  MBRMRL01: ["vic", "nsw"], // 45cm foam roller
  MMDESH04: ["vic", "nsw"], // dead ball 9kg
  MMDESH06: ["vic", "nsw"], // dead ball 12kg
  MMKBPGC02: ["vic", "nsw"], // kettlebell 8kg
  MMKBPGC04: ["vic", "nsw"], // kettlebell 12kg (Sydney by $0.95)
  MMKBPGC05: ["vic", "nsw"], // kettlebell 16kg
  MMKBPGC07: ["vic", "nsw"], // kettlebell 20kg
  MMMBPR03: ["vic", "nsw"], // medicine ball 6kg
  MMMBPR04: ["vic", "nsw"], // medicine ball 8kg
  MMMBPR05: ["vic", "nsw"], // medicine ball 10kg
  // Melbourne only
  MMDESH07: ["vic"], // dead ball 15kg (a tie in Sydney counts as a loss)
  MMKBPGC03: ["vic"], // kettlebell 10kg
  MWWPCB01: ["vic"], // coloured bumper 5kg
  MWWPCB02: ["vic"], // coloured bumper 10kg
  MWWPCB04: ["vic"], // coloured bumper 20kg
  // Sydney and Perth
  MWWPOPR02: ["nsw", "wa"], // premium rubber plate 2.5kg
  // Lost in all three cities
  MMDESH08: [], // dead ball 20kg
  MWWPCB03: [], // coloured bumper 15kg
  MWWPOPR03: [], // premium rubber plate 5kg
  MWWPOPR04: [], // premium rubber plate 10kg
  MWWPOPR06: [], // premium rubber plate 20kg
};

/**
 * custom_label_3: where a paid campaign may show this size. "national" for a
 * size that wins in every city measured, or that had no Little Bloke
 * equivalent; otherwise the winning states joined, e.g. "vic-nsw". Undefined
 * when it wins nowhere, which also means it is not advertised at all.
 */
export function regionLabel(code: string): string | undefined {
  const wins = LANDED_PRICE_WINS[code.toUpperCase()];
  if (wins === undefined) return "national";
  if (wins.length === 0) return undefined;
  if (wins.length === 3) return "national";
  return wins.join("-");
}
