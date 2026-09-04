// Writing a web order straight into the ERP, instead of into WooCommerce and
// hoping Wbsync carries it across.
//
// WHY THIS EXISTS. Orders currently go site -> WooCommerce -> Wbsync ->
// Unleashed, and that chain broke on 27 August at 09:12 when the domain moved
// and WooCommerce lost its hostname. Of the last 200 sales orders in Unleashed
// exactly one carries a #woo-order reference, and it is next to the test orders
// we already owe a void. So the link is not degraded, it is absent — and the
// fix is to remove the two hops rather than repair them.
//
// STATUS: NOT WIRED UP. Nothing calls createUnleashedOrder yet and it refuses to
// run unless UNLEASHED_WRITE_ENABLED is "true". Two things are outstanding and
// neither is code:
//
//   1. WRITE SCOPE on the API key is unconfirmed. Unleashed grants read and
//      write separately and our reads prove nothing about writes.
//   2. THE CUSTOMER DECISION, below. It changes the payload, not a field.
//
// The payload builder is pure and fully tested, so when both land this is a
// matter of turning it on rather than writing it.
import { createHmac, randomUUID } from "node:crypto";
import { getUnleashedMap, lookupBySku, type UnleashedEntry } from "@/lib/unleashed";
import type { OrderLine } from "@/lib/woo-orders";

const BASE = "https://api.unleashedsoftware.com";

// Unleashed stores and reconciles ex-GST and applies TaxRate on top, exactly as
// WooCommerce did. Our line prices are GST-INCLUSIVE all the way from the map
// (unleashed.ts multiplies by 1.1 at build time), so they divide back out here.
// This is the same conversion woo-orders.ts makes and the same one that, when it
// was missing, recorded order 490118 at $90.48 against an $86.80 card charge.
const GST = 1.1;
const TAX_RATE = 0.1;
const XERO_TAX_CODE = "G.S.T.";

/**
 * MELB WHS, the account's default. Overridable for a warehouse move.
 *
 * READ AT CALL TIME, not at import. A `const` here freezes the value into the
 * module the first time it is loaded, which makes the setting silently
 * unchangeable per environment and untestable — the freight test caught exactly
 * that.
 */
const warehouseCode = () => process.env.UNLEASHED_WAREHOUSE_CODE || "MELB WHS";

/**
 * Freight is a LINE, not a shipping method. Unleashed has no equivalent of
 * WooCommerce's shipping_lines, and the ERP already carries freight products in
 * its "Freight & Delivery" and "Other Costs" groups. Which code to use is a
 * finance question, so it is configuration rather than a constant.
 */
const freightCode = () => process.env.UNLEASHED_FREIGHT_CODE || "";

// ---------------------------------------------------------------------------
// THE CUSTOMER DECISION
//
// This is the one real difference between the two systems. WooCommerce took the
// buyer's details inline on the order; Unleashed requires an existing Customer
// record, and there are 4,108 of them with no generic web account among them.
// The one Woo-sourced order in the ERP was matched to BFT-MACQUARIE PARK, a real
// trade account, which is Wbsync's doing and not a convention we can inherit.
//
// Three ways to answer it, and they are not equivalent:
//
//   "generic"     One account, every web order against it, the buyer's details
//                 in the delivery fields and Comments. Keeps a 4,108-row master
//                 file clean. Costs you per-customer reporting on web sales.
//
//   "per-order"   A new Customer for every order. Best records per sale, and it
//                 fills the master file with one-off retail buyers who will
//                 never order again.
//
//   "match-email" Look the buyer up by email, create only if absent. Best data
//                 and the most work, with real duplicate risk against 4,108
//                 existing records that were not deduplicated on email.
//
// Steve or Gaetana decides. Until then only "generic" is implemented, and it
// still needs an account to exist — it will not invent one.
// ---------------------------------------------------------------------------

export type CustomerStrategy = "generic" | "per-order" | "match-email";

export type CustomerRef = { CustomerCode: string } | { Guid: string };

export type Billing = {
  first_name?: string;
  last_name?: string;
  company?: string;
  email: string;
  phone?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

export function customerStrategy(): CustomerStrategy {
  const s = process.env.UNLEASHED_CUSTOMER_STRATEGY;
  return s === "per-order" || s === "match-email" ? s : "generic";
}

/**
 * Which Customer the order is written against.
 *
 * Isolated deliberately: the decision above changes only this function and the
 * Comments block that carries the buyer's details when the account is shared.
 * Everything else in the payload is the same whichever way it goes.
 */
export async function resolveCustomer(billing: Billing): Promise<CustomerRef> {
  const strategy = customerStrategy();

  if (strategy === "generic") {
    const code = process.env.UNLEASHED_WEB_CUSTOMER_CODE;
    // Refuse rather than guess. Writing a web order against an arbitrary trade
    // account is worse than not writing it: it lands in somebody's real ledger.
    if (!code) {
      throw new Error(
        "UNLEASHED_WEB_CUSTOMER_CODE is not set. The generic strategy needs a web " +
          "sales account to exist in Unleashed; it will not create or guess one."
      );
    }
    return { CustomerCode: code };
  }

  // Deliberately unimplemented. Both remaining strategies need decisions that
  // have not been made — whether one-off buyers belong in the customer master,
  // and how to match against 4,108 records that were never deduplicated on
  // email. Guessing either would put bad rows in the ERP.
  throw new Error(
    `Customer strategy "${strategy}" is not implemented yet, so the order for ` +
      `${billing.email} was not written — see the decision note in lib/unleashed-orders.ts`
  );
}

// ---------------------------------------------------------------------------

export type CreateUnleashedOrderInput = {
  billing: Billing;
  shipping?: Billing;
  lines: OrderLine[];
  /** Stripe PaymentIntent id, recorded so a payment can be tied to an order. */
  paymentIntentId?: string;
  customerNote?: string;
  /** What the card was actually charged, goods + freight, inc GST. */
  chargedTotal?: number;
  freight?: { amount: number; service?: string; carrier?: string };
};

export type UnleashedOrderResult = {
  guid: string;
  orderNumber: string;
  status: string;
  total: number;
};

type PayloadLine = Record<string, unknown>;

const round2 = (n: number) => Math.round(n * 100) / 100;
/** GST-inclusive in, ex-GST out. Four places: Unleashed stores unit prices at 4dp. */
const exGst = (incGst: number) => Math.round((incGst / GST) * 10000) / 10000;

/** Unleashed serialises dates as /Date(ms)/ and accepts ISO on the way in. */
const isoDay = (d: Date) => d.toISOString();

function nameOf(b: Billing): string {
  return [b.first_name, b.last_name].filter(Boolean).join(" ").trim() || b.company || b.email;
}

/**
 * The buyer, written where a human will actually read it.
 *
 * Under the shared-account strategy the Customer is "web sales" and says nothing
 * about who bought this, so the details go in Comments. Whoever picks and
 * dispatches the order needs a name and a phone number, and the delivery block
 * alone does not carry the email or the note they left.
 */
export function buildComments(input: CreateUnleashedOrderInput): string {
  const b = input.billing;
  const parts = [
    "Website order.",
    `Buyer: ${nameOf(b)}`,
    `Email: ${b.email}`,
    b.phone ? `Phone: ${b.phone}` : "",
    b.company ? `Company: ${b.company}` : "",
    input.paymentIntentId ? `Stripe: ${input.paymentIntentId}` : "",
    input.freight && input.freight.amount > 0
      ? `Freight charged: ${input.freight.amount.toFixed(2)} inc GST` +
        `${[input.freight.carrier, input.freight.service].filter(Boolean).join(" ") ? ` (${[input.freight.carrier, input.freight.service].filter(Boolean).join(" ")})` : ""}`
      : "FREIGHT NOT CHARGED — quote before dispatch.",
    input.customerNote ? `Customer note: ${input.customerNote}` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

/**
 * The SalesOrder body. Pure — no network, no clock beyond the date passed in —
 * so the shape can be tested without an ERP to write to.
 */
export function buildSalesOrderPayload(
  input: CreateUnleashedOrderInput,
  customer: CustomerRef,
  erp: Record<string, UnleashedEntry>,
  opts: { guid: string; now?: Date } = { guid: "" }
): Record<string, unknown> {
  const now = opts.now ?? new Date();
  const ship = input.shipping ?? input.billing;

  const lines: PayloadLine[] = input.lines.map((l, i) => {
    const code = l.sku?.trim();
    const entry = code ? lookupBySku(erp, code) : null;
    // Fail closed, as the re-pricing does: an order line the ERP cannot identify
    // is one the warehouse cannot pick.
    if (!code) throw new Error(`Order line ${i + 1} has no ERP ProductCode`);
    if (!entry) throw new Error(`Order line ${i + 1}: ERP does not know ProductCode ${code}`);

    const unitEx = exGst(l.unitPrice);
    const lineEx = round2(unitEx * l.quantity);
    return {
      LineNumber: i + 1,
      // Guid AND code: the Guid is what Unleashed keys on, the code is what a
      // person reads back. Sending both survives a Guid we failed to cache.
      Product: { ...(entry.guid ? { Guid: entry.guid } : {}), ProductCode: code },
      OrderQuantity: l.quantity,
      UnitPrice: unitEx,
      LineTotal: lineEx,
      DiscountRate: 0,
      TaxRate: TAX_RATE,
      LineTax: round2(lineEx * TAX_RATE),
      XeroTaxCode: XERO_TAX_CODE,
    };
  });

  // Freight rides as a line because Unleashed has no shipping_lines. A zero or
  // absent freight charge adds NO line at all rather than a $0 one: on heavy
  // goods a $0 freight line reads as "ship it for nothing", which is how a rig
  // leaves the warehouse unpaid for. The Comments say so in words instead.
  if (input.freight && input.freight.amount > 0) {
    const code = freightCode();
    if (!code) {
      throw new Error(
        "UNLEASHED_FREIGHT_CODE is not set, but this order carries freight. " +
          "Pick a code from the ERP's Freight & Delivery group."
      );
    }
    const unitEx = exGst(input.freight.amount);
    lines.push({
      LineNumber: lines.length + 1,
      Product: { ProductCode: code },
      OrderQuantity: 1,
      UnitPrice: unitEx,
      LineTotal: unitEx,
      DiscountRate: 0,
      TaxRate: TAX_RATE,
      LineTax: round2(unitEx * TAX_RATE),
      XeroTaxCode: XERO_TAX_CODE,
      Comments: [input.freight.carrier, input.freight.service].filter(Boolean).join(" ") || "Freight",
    });
  }

  const subTotal = round2(lines.reduce((s, l) => s + (l.LineTotal as number), 0));
  const taxTotal = round2(lines.reduce((s, l) => s + (l.LineTax as number), 0));

  return {
    Guid: opts.guid,
    OrderDate: isoDay(now),
    RequiredDate: isoDay(now),
    // Parked is where the one existing web-sourced order sits, and it is the
    // right door: an order arrives for someone to look at, not straight into
    // picking. Changing this changes what the warehouse acts on unprompted.
    OrderStatus: "Parked",
    Customer: customer,
    // Wbsync put the WooCommerce order number here. The payment reference is the
    // equivalent handle now — it is what reconciles a bank line to this order.
    CustomerRef: input.paymentIntentId || "",
    Warehouse: { WarehouseCode: warehouseCode() },
    Comments: buildComments(input),
    DeliveryName: nameOf(ship),
    DeliveryStreetAddress: ship.address_1 || "",
    DeliveryStreetAddress2: ship.address_2 || "",
    DeliverySuburb: ship.city || "",
    DeliveryRegion: ship.state || "",
    DeliveryPostCode: ship.postcode || "",
    DeliveryCountry: ship.country || "Australia",
    Currency: { CurrencyCode: "AUD" },
    ExchangeRate: 1,
    DiscountRate: 0,
    TaxRate: TAX_RATE,
    XeroTaxCode: XERO_TAX_CODE,
    SubTotal: subTotal,
    TaxTotal: taxTotal,
    Total: round2(subTotal + taxTotal),
    SalesOrderLines: lines,
  };
}

/**
 * Reconciliation guard, kept from the WooCommerce path for the same reason: if
 * what we recorded differs from what the card was charged, the customer paid a
 * different number than the ERP believes. Log it loudly, never throw — the
 * payment has already gone through and losing the order is the worse outcome.
 */
export function checkTotalAgainstCharge(total: number, chargedTotal?: number, ref = "") {
  if (typeof chargedTotal !== "number") return;
  const a = Math.round(total * 100);
  const b = Math.round(chargedTotal * 100);
  if (a !== b) {
    console.warn(`[unleashed-order] total mismatch: charged ${b}c but order ${ref} totals ${a}c`);
  }
}

export function ordersEnabled(): boolean {
  return process.env.UNLEASHED_WRITE_ENABLED === "true";
}

/**
 * Create the order. Gated, and deliberately unreferenced until the write scope
 * on the API key is confirmed and the customer strategy is chosen.
 */
export async function createUnleashedOrder(
  input: CreateUnleashedOrderInput
): Promise<UnleashedOrderResult> {
  if (!ordersEnabled()) {
    throw new Error("Unleashed order creation is disabled (UNLEASHED_WRITE_ENABLED)");
  }

  const [erp, customer] = await Promise.all([
    getUnleashedMap().catch(() => ({})),
    resolveCustomer(input.billing),
  ]);

  // OUR Guid, not theirs. Unleashed takes the key from the caller, which makes a
  // retry idempotent in a way the WooCommerce POST never was: the same Guid is
  // the same order, so a timeout that actually succeeded cannot bill twice.
  const guid = randomUUID();
  const body = buildSalesOrderPayload(input, customer, erp, { guid });

  const res = await fetch(`${BASE}/SalesOrders/${guid}`, {
    method: "POST",
    headers: unleashedWriteHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Unleashed SalesOrder create ${res.status}: ${text.slice(0, 300)}`);
  }

  const order = (await res.json()) as {
    Guid?: string;
    OrderNumber?: string;
    OrderStatus?: string;
    Total?: number;
  };
  const total = Number(order.Total ?? body.Total);
  checkTotalAgainstCharge(total, input.chargedTotal, order.OrderNumber ?? guid);

  return {
    guid: order.Guid ?? guid,
    orderNumber: order.OrderNumber ?? "",
    status: order.OrderStatus ?? "Parked",
    total,
  };
}

// Signing lives here rather than being exported from unleashed.ts because a POST
// signs the QUERY STRING, which is empty on this endpoint — the body is not part
// of the signature. Confirmed against the API's own docs; the first live write
// should be checked against a 403 before anything is wired to it.
function unleashedWriteHeaders(): Record<string, string> {
  const sig = createHmac("sha256", process.env.UNLEASHED_API_KEY ?? "")
    .update("", "utf8")
    .digest("base64");
  return {
    "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
    "api-auth-signature": sig,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}
