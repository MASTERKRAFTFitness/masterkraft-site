// After a card order exists: put it into Easyship as a shipment, so the team
// dispatches from Easyship's "To Ship" list instead of re-keying every order.
//
// Until 2026-10-05 the site only ever asked Easyship for RATES. The first web
// order (SO-00000862) was typed into Easyship by hand, address and all, and the
// suburb came back wrong - Easyship guessed Brunswick South for 3055 when the
// customer lives in Brunswick West. Copying the order across by machine is the
// fix for both the typing and the guessing.
//
// THE LABEL IS NEVER BOUGHT HERE. A label is money, and this runs unattended on
// every order, so the shipment lands in "To Ship" and a person checks it and
// clicks Ship. `buy_label: false` is Easyship's default too; it is stated rather
// than relied on, because a default is exactly the kind of thing that changes.
//
// OFF UNTIL SWITCHED ON. Nothing is created unless EASYSHIP_SHIPMENT_SYNC is
// "true", so merging this changes nothing in production by itself. The rates
// token is reused, and it needs the `public.shipment:write` scope on top of the
// rates scope.
//
// NONE OF THIS MAY FAIL AN ORDER. By the time it runs the card is charged and the
// sales order is in Unleashed. Every failure is caught and reported as a result,
// and the team is emailed so the shipment can be added by hand - a shipment that
// silently never appears is the one outcome this exists to prevent.
import type { OrderAddress, OrderLine } from "@/lib/order-lines";
import {
  collectionAddress,
  partitionConsignments,
  type FreightItem,
  type Parcel,
} from "@/lib/freight";
import { internalRecipients } from "@/lib/notify-recipients";

const EASYSHIP_SHIPMENTS_URL = "https://public-api.easyship.com/2024-09/shipments";
const TIMEOUT_MS = 10_000;

/** Easyship rejects the whole request if an address line runs past this. */
const MAX_LINE = 35;

export type ShipmentOrder = {
  orderNumber: string;
  billing: OrderAddress;
  shipping?: OrderAddress;
  lines: OrderLine[];
  /** Cartons, resolved server-side by refsToFreightItems. */
  items: FreightItem[];
  /** The freight option the customer paid for, e.g. `easyship:<uuid>`. */
  freightOptionId?: string;
  /** "Aramex Domestic", for the shipment's notes and the team email. */
  freightLabel?: string;
  customerNote?: string;
};

export type ShipmentSyncResult =
  | { status: "skipped"; reason: string }
  | { status: "created"; shipments: string[] }
  | { status: "error"; error: string; created: string[]; alerted: boolean };

/** One carton, still knowing which line of the order it carries. */
type Carton = Parcel & { sku: string; name: string };

/** One Easyship shipment: some cartons, and the courier picked for them. */
export type PlannedShipment = { cartons: Carton[]; courierServiceId?: string };

export function shipmentSyncEnabled(): boolean {
  return (process.env.EASYSHIP_SHIPMENT_SYNC ?? "").toLowerCase() === "true";
}

/**
 * The same cartons the checkout priced: one per unit, each with its own box.
 *
 * Mirrors itemsToParcels exactly, down to rounding up, but keeps the SKU on each
 * carton so the shipment can say what is inside it. Lines without carton data
 * are dropped here as they were when freight was quoted.
 */
export function itemsToCartons(items: FreightItem[]): Carton[] {
  const cartons: Carton[] = [];
  for (const item of items) {
    const usable =
      item.weightKg > 0 && item.lengthCm > 0 && item.widthCm > 0 && item.heightCm > 0;
    if (!usable) continue;
    for (let i = 0; i < Math.max(1, Math.floor(item.quantity)); i++) {
      cartons.push({
        sku: item.sku,
        name: item.name,
        weight: item.weightKg,
        length: Math.ceil(item.lengthCm),
        width: Math.ceil(item.widthCm),
        height: Math.ceil(item.heightCm),
      });
    }
  }
  return cartons;
}

/**
 * Split the order into Easyship shipments, following the freight the customer
 * actually bought.
 *
 *   easyship:<id>          one shipment, that courier
 *   split:<a>+<b>+...      one shipment per consignment, in partitionConsignments
 *                          order, each with its own courier where it was Easyship
 *   whole:<id>             the whole cart as one consignment (a matrix price)
 *   anything else          one shipment, no courier: Easyship picks, a person checks
 *
 * A courier is only ever PRESELECTED, never forced: the shipment is created with
 * fallback allowed, because a shipment with the next-best courier that a person
 * reviews beats no shipment at all.
 */
export function planShipments(cartons: Carton[], optionId?: string): PlannedShipment[] {
  if (cartons.length === 0) return [];
  const id = (optionId ?? "").trim();
  const courierFor = (part: string) =>
    part.startsWith("easyship:") ? part.slice("easyship:".length) || undefined : undefined;

  if (id.startsWith("split:")) {
    const parts = id.slice("split:".length).split("+");
    const groups = partitionConsignments(cartons);
    // The checkout built the split from the same cartons in the same order, so
    // the parts line up with the groups. If they do not, the cart changed shape
    // somewhere and guessing which courier went with which box would be worse
    // than letting Easyship choose for the lot.
    if (groups.length !== parts.length) return [{ cartons }];
    return groups.map((g, i) => ({ cartons: g, courierServiceId: courierFor(parts[i]) }));
  }
  if (id.startsWith("whole:")) {
    return [{ cartons, courierServiceId: courierFor(id.slice("whole:".length)) }];
  }
  return [{ cartons, courierServiceId: courierFor(id) }];
}

/**
 * Easyship takes two street lines of 35 characters, where the checkout has one
 * line of any length. Break on a space where possible so a street number is not
 * cut in half.
 */
export function splitStreet(street: string): { line_1: string; line_2?: string } {
  const s = street.trim().replace(/\s+/g, " ");
  if (s.length <= MAX_LINE) return { line_1: s };
  let cut = s.lastIndexOf(" ", MAX_LINE);
  if (cut <= 0) cut = MAX_LINE;
  const line_1 = s.slice(0, cut).trim();
  const line_2 = s.slice(cut).trim().slice(0, MAX_LINE);
  return line_2 ? { line_1, line_2 } : { line_1 };
}

function originAddress(): Record<string, string> | { error: string } {
  const c = collectionAddress();
  if (!c || !c.line1) return { error: "no collection address (FREIGHT_COLLECTION_*)" };
  const phone = process.env.EASYSHIP_ORIGIN_PHONE?.trim();
  if (!phone) return { error: "EASYSHIP_ORIGIN_PHONE is not set" };
  const email = process.env.EASYSHIP_ORIGIN_EMAIL?.trim() || internalRecipients()[0];
  if (!email) return { error: "no origin email (EASYSHIP_ORIGIN_EMAIL or QUOTE_TO_EMAIL)" };
  return {
    contact_name: process.env.EASYSHIP_ORIGIN_CONTACT?.trim() || "MasterKraft",
    company_name: "MasterKraft",
    contact_phone: phone,
    contact_email: email,
    ...splitStreet(c.line1),
    city: c.city,
    state: c.state ?? "",
    postal_code: c.postcode,
    country_alpha2: "AU",
  };
}

function destinationAddress(o: ShipmentOrder): Record<string, string> | { error: string } {
  const b = o.billing;
  const a = o.shipping?.address_1 ? o.shipping : b;
  // A shipping address without its own contact details is still the buyer's
  // parcel, so the buyer's name, phone and email fill the gaps.
  const name = [a.first_name || b.first_name, a.last_name || b.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const phone = (a.phone || b.phone || "").trim();
  const email = (a.email || b.email || "").trim();
  if (!a.address_1 || !a.city || !a.postcode) return { error: "delivery address is incomplete" };
  if (!name || !phone || !email) return { error: "delivery contact is incomplete" };
  const company = (a.company || "").trim();
  return {
    contact_name: name,
    ...(company ? { company_name: company } : {}),
    contact_phone: phone,
    contact_email: email,
    ...splitStreet(a.address_1),
    city: a.city,
    state: a.state ?? "",
    postal_code: a.postcode,
    country_alpha2: "AU",
  };
}

/** The request body for one planned shipment. Exported for the tests. */
export function shipmentBody(
  o: ShipmentOrder,
  plan: PlannedShipment,
  index: number,
  of: number,
  origin: Record<string, string>,
  destination: Record<string, string>
) {
  // Declared value per unit, GST-inclusive, from what the customer paid. It only
  // matters if Easyship insurance is ever switched on, which prices off it; a
  // domestic parcel declares nothing to customs. Easyship refuses zero.
  const priceBySku = new Map(o.lines.filter((l) => l.sku).map((l) => [l.sku, l.unitPrice]));
  const reference = of > 1 ? `${o.orderNumber} (${index + 1}/${of})` : o.orderNumber;
  const notes = [
    o.freightLabel ? `Customer paid for: ${o.freightLabel}` : "",
    of > 1 ? `Consignment ${index + 1} of ${of}` : "",
    "Created automatically by masterkraft.com. Check before buying the label.",
  ]
    .filter(Boolean)
    .join(". ");
  return {
    origin_address: origin,
    destination_address: destination,
    // It is a web order to a person, and the checkout does not ask. Residential
    // is the safer guess: a business marked residential still gets its parcel,
    // where the reverse can bounce off a closed reception.
    set_as_residential: !(o.shipping?.company || o.billing.company),
    incoterms: "DDU",
    courier_settings: plan.courierServiceId
      ? { courier_service_id: plan.courierServiceId, allow_fallback: true }
      : {},
    shipping_settings: { buy_label: false },
    order_data: {
      platform_name: "masterkraft.com",
      platform_order_number: reference,
      seller_notes: notes,
      ...(o.customerNote ? { buyer_notes: o.customerNote.slice(0, 500) } : {}),
      ...(o.freightLabel ? { buyer_selected_courier_name: o.freightLabel } : {}),
    },
    parcels: plan.cartons.map((c) => ({
      total_actual_weight: c.weight,
      box: { length: c.length, width: c.width, height: c.height },
      items: [
        {
          description: c.name.slice(0, 200),
          sku: c.sku,
          // Required by Easyship's schema even for a domestic parcel - see the
          // same note in quoteEasyship.
          category: "sport_leisure",
          quantity: 1,
          actual_weight: c.weight,
          declared_currency: "AUD",
          declared_customs_value: Math.max(1, priceBySku.get(c.sku) ?? 1),
          origin_country_alpha2: "AU",
        },
      ],
    })),
  };
}

/**
 * Create the order's shipments in Easyship. Never throws.
 */
export async function syncShipmentsToEasyship(o: ShipmentOrder): Promise<ShipmentSyncResult> {
  if (!shipmentSyncEnabled()) return { status: "skipped", reason: "EASYSHIP_SHIPMENT_SYNC is off" };
  const token = process.env.EASYSHIP_API_TOKEN;
  if (!token) return { status: "skipped", reason: "no EASYSHIP_API_TOKEN" };

  const created: string[] = [];
  try {
    const origin = originAddress();
    if ("error" in origin) throw new Error(origin.error);
    const destination = destinationAddress(o);
    if ("error" in destination) throw new Error(destination.error);

    const cartons = itemsToCartons(o.items);
    if (cartons.length === 0) throw new Error("no line on the order has carton dimensions");
    const plans = planShipments(cartons, o.freightOptionId);

    // One at a time, so a failure part-way says exactly which consignments exist.
    for (let i = 0; i < plans.length; i++) {
      const body = shipmentBody(o, plans[i], i, plans.length, origin, destination);
      created.push(await createShipment(body, token));
    }
    return { status: "created", shipments: created };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[easyship-shipments] could not create", { order: o.orderNumber, error, created });
    const alerted = await alertTeam(o, error, created).catch((err) => {
      console.error("[easyship-shipments] alert failed", err);
      return false;
    });
    return { status: "error", error, created, alerted };
  }
}

async function createShipment(body: unknown, token: string): Promise<string> {
  const res = await fetch(EASYSHIP_SHIPMENTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const parsed = (await res.json().catch(() => null)) as {
    shipment?: { easyship_shipment_id?: string };
    error?: { message?: string; details?: string[] };
    message?: string;
  } | null;
  if (!res.ok) {
    // `details` names the offending field; `message` alone is usually just
    // "The request body content is not valid." - the same lesson as the rates call.
    const details = Array.isArray(parsed?.error?.details) ? parsed.error.details.join("; ") : "";
    const message = parsed?.error?.message ?? parsed?.message ?? `HTTP ${res.status}`;
    throw new Error(details ? `${message} ${details}` : message);
  }
  const id = parsed?.shipment?.easyship_shipment_id;
  if (!id) throw new Error("Easyship accepted the shipment but returned no shipment id");
  return id;
}

/** Tell a human, so the shipment gets added by hand. True if the email went. */
async function alertTeam(o: ShipmentOrder, error: string, created: string[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;
  const to = internalRecipients();
  if (!apiKey || !from || to.length === 0) return false;
  const html = `
    <h2>Web order #${escape(o.orderNumber)} is not in Easyship</h2>
    <p>The order is paid and in Unleashed, but the Easyship shipment could not be created
    automatically. Please add it by hand in Easyship (Shipments → Create → Manual Input).</p>
    <p><strong>Reason:</strong> ${escape(error)}</p>
    ${created.length > 0 ? `<p>Already created in Easyship: ${created.map(escape).join(", ")}. Only the rest is missing.</p>` : ""}
    ${o.freightLabel ? `<p>The customer paid for: ${escape(o.freightLabel)}</p>` : ""}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: `Add web order #${o.orderNumber} to Easyship by hand`,
      html,
    }),
    signal: AbortSignal.timeout(8000),
  });
  return res.ok;
}

function escape(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] || c);
}
