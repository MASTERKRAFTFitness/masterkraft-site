// custom_label_4 — the Google Ads promotion list, carried in the primary feed.
//
// THE CSV WAS NEVER MEANT TO BE A SECOND PRIMARY SOURCE. scripts/landed-price
// publishes public/merchant-center-promotion.csv as `id,custom_label_4`, a
// supplemental feed. In Merchant Center it was added as a PRIMARY source, so
// each of its 60 ids became a second product holding nothing but a label: no
// title, price, availability, image or link. By 28 Oct that was all 60 "missing
// availability" disapprovals and most of the "missing price" ones, and the label
// itself never reached the real items.
//
// Reading the same file here puts the label on the feed's own items, so the CSV
// source can be removed from Merchant Center and nothing has to be configured
// correctly account-side for the label to land. The file stays the one place the
// list is edited; compare.py --publish keeps writing it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PromotionLabels = Record<string, string>;

/** `id,custom_label_4` rows to a code → label map. Unknown columns are ignored. */
export function parsePromotionCsv(text: string): PromotionLabels {
  const [header, ...rows] = text.split(/\r?\n/);
  const cols = (header ?? "").split(",").map((c) => c.trim().toLowerCase());
  const idAt = cols.indexOf("id");
  const labelAt = cols.indexOf("custom_label_4");
  if (idAt < 0 || labelAt < 0) return {};
  const labels: PromotionLabels = {};
  for (const row of rows) {
    const cells = row.split(",").map((c) => c.trim());
    const id = cells[idAt]?.toUpperCase();
    const label = cells[labelAt];
    if (id && label) labels[id] = label;
  }
  return labels;
}

/**
 * The published list. next.config.ts traces the file into the feed's function,
 * because /public is served from the CDN and is not otherwise on its disk.
 *
 * FAILS SOFT to {}, and loudly. A missing label costs a campaign filter; a
 * thrown error would cost the whole feed, which Merchant Center reads as every
 * product withdrawn.
 */
export function loadPromotionLabels(): PromotionLabels {
  try {
    return parsePromotionCsv(readFileSync(join(process.cwd(), "public", "merchant-center-promotion.csv"), "utf8"));
  } catch (err) {
    console.error("merchant feed: promotion list unreadable, custom_label_4 omitted", err);
    return {};
  }
}
