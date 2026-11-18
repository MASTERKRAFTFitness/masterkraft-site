// Turning stored ad clicks into a Google Ads offline conversion upload.
// See lib/ad-click for why this exists.
//
// THE CSV is Google's "conversions from clicks" template: Ads > Goals >
// Conversions > Uploads, against two conversion actions of type Import >
// "Manual import using API or uploads". Their names must match the env vars
// below (or the defaults) exactly, or Ads rejects every row.
//
// WHAT GOES IN
//   checkout  only once paid    -> the purchase action, valued at the cart subtotal
//   quote     always            -> the lead action, valued at the cart subtotal
//   brief     always            -> the lead action, no value (Ads uses the action's default)
// An abandoned checkout is not a conversion, and a checkout that became a quote
// request is counted once, through its quote row.
//
// WHAT STAYS OUT
//   consent = granted   The visitor accepted cookies, so the browser tag has
//                       already counted them. Uploading too would count twice.
//   no gclid            gbraid/wbraid clicks (iOS) cannot go through the CSV
//                       template; they are kept for a future API upload.
//   already exported    Each lead is uploaded once.

export const OFFLINE_LEAD_NAME = process.env.ADS_OFFLINE_LEAD_NAME || "Quote request - offline import";
export const OFFLINE_PURCHASE_NAME = process.env.ADS_OFFLINE_PURCHASE_NAME || "Purchase - offline import";

export type ExportableRow = {
  kind: "checkout" | "quote" | "brief";
  ref: string;
  gclid: string | null;
  consent: "granted" | "unspecified";
  value: number | null;
  exported_at: string | null;
  created_at: string;
  checkout_status?: string | null;
};

export type OfflineConversion = {
  kind: ExportableRow["kind"];
  ref: string;
  gclid: string;
  name: string;
  time: string;
  value: number | null;
};

export type SkipReason = "consented" | "no_gclid" | "exported" | "not_converted";

/** Why a row is not uploaded, or null when it is. */
export function skipReason(row: ExportableRow): SkipReason | null {
  if (row.exported_at) return "exported";
  if (!row.gclid) return "no_gclid";
  if (row.consent === "granted") return "consented";
  if (row.kind === "checkout" && row.checkout_status !== "paid") return "not_converted";
  return null;
}

/** "2026-11-18 03:04:05+00:00" - a format the Ads template accepts with its offset. */
export function adsTime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "+00:00");
}

export function offlineConversions(
  rows: ExportableRow[],
  names = { lead: OFFLINE_LEAD_NAME, purchase: OFFLINE_PURCHASE_NAME }
): OfflineConversion[] {
  return rows
    .filter((r) => skipReason(r) === null)
    .map((r) => ({
      kind: r.kind,
      ref: r.ref,
      gclid: r.gclid as string,
      name: r.kind === "checkout" ? names.purchase : names.lead,
      // When the lead reached us. For a paid checkout that is when freight was
      // first quoted, a little before payment - after the click, which is all
      // Ads requires, and close enough for attribution.
      time: adsTime(r.created_at),
      value: r.kind === "brief" ? null : r.value,
    }));
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function offlineConversionsCsv(conversions: OfflineConversion[]): string {
  const header = ["Google Click ID", "Conversion Name", "Conversion Time", "Conversion Value", "Conversion Currency"];
  const lines = conversions.map((c) =>
    [c.gclid, c.name, c.time, c.value == null ? "" : c.value.toFixed(2), c.value == null ? "" : "AUD"]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}
