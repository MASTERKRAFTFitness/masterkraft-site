// Finding, or creating, the Unleashed Customer a web order belongs to.
//
// WHY. Until 2026-11-18 every web order was written against one shared account,
// WEB-MASTERKRAFT "MasterKraft Website". Unleashed syncs invoices to Xero, so a
// web buyer's invoice was addressed to "MasterKraft Website", not to them.
// TAFE NSW asked for an invoice for SO-00000877 and there was no correct one to
// send. Booking each order to the buyer's own Customer fixes the invoice where
// it is made, and Xero gets a real contact.
//
// THE RULE, in order:
//   1. An existing, non-obsolete Customer whose Email is exactly the buyer's.
//      Exactly one match is used. Several is AMBIGUOUS: staff emails sit on
//      more than one trade account (adam@masterkraft.com is on two), and
//      guessing puts a sale in the wrong ledger, so that falls back.
//   2. No match: create one the way staff key an online buyer by hand.
//      Code SURNAME(4) + INITIAL + NN (ALEXV01 = Vicki Alexellis), type Online,
//      tier T7-DIRECT, 100% Upfront, Xero sales account 4000, GST.
//   3. Anything else (no email, an ambiguous match, an API error): the shared
//      web account, with the reason in the order's Comments. An order is never
//      lost over who it is addressed to; the card is already charged.
import { createHmac, randomUUID } from "node:crypto";
import type { Billing, CustomerRef } from "@/lib/unleashed-orders";

const BASE = "https://api.unleashedsoftware.com";
const TIMEOUT_MS = 8000;

/** Copied from the Online customers staff create (37 of them, all alike). */
export const NEW_CUSTOMER_DEFAULTS = {
  CustomerType: "Online",
  SellPriceTier: "T7-DIRECT",
  PaymentTerm: "100% Upfront",
  XeroSalesAccount: "4000",
  TaxCode: "G.S.T.",
  Taxable: true,
  Currency: { CurrencyCode: "AUD" },
} as const;

export type RawCustomer = {
  Guid: string;
  CustomerCode: string;
  CustomerName?: string | null;
  Email?: string | null;
  CustomerType?: string | null;
  Obsolete?: boolean | null;
};

export type ResolvedCustomer =
  | { how: "matched" | "created"; ref: CustomerRef; code: string }
  | { how: "fallback"; reason: string };

// ---------------------------------------------------------------------------
// Pure parts, tested without an ERP.
// ---------------------------------------------------------------------------

/** Lower-case and trimmed; a trailing "." is a typo staff left on some records. */
export function normaliseEmail(e: string | null | undefined): string {
  return String(e ?? "").trim().toLowerCase().replace(/\.+$/, "");
}

/**
 * The value to send as `contactEmail`. Unleashed matches it as a
 * case-insensitive PREFIX, and checks the signature against the DECODED query,
 * so an encoded character 403s. Send only the part before anything that would
 * need encoding (a "+" would arrive as a space), and compare exactly after.
 */
export function emailQueryPrefix(email: string): string {
  return /^[A-Za-z0-9._@-]+/.exec(email)?.[0] ?? "";
}

/** The one Customer this email belongs to, or why there isn't one. */
export function pickMatch(
  email: string,
  candidates: RawCustomer[]
): { customer: RawCustomer } | { none: true } | { ambiguous: string[] } {
  const want = normaliseEmail(email);
  const hits = candidates.filter((c) => !c.Obsolete && normaliseEmail(c.Email) === want);
  if (hits.length === 1) return { customer: hits[0] };
  if (hits.length === 0) return { none: true };
  return { ambiguous: hits.map((c) => c.CustomerCode) };
}

const letters = (s: string | undefined) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();

/**
 * Staff's code for an online buyer: four letters of the surname and the first
 * initial (ALEXV, BAILC; a short surname stays short, AUR = Richard Au). With
 * no surname, the first name; with no name at all, the email's local part.
 */
export function customerCodeBase(b: Billing): string {
  const last = letters(b.last_name);
  const first = letters(b.first_name);
  if (last) return last.slice(0, 4) + (first.slice(0, 1) || "X");
  if (first) return first.slice(0, 5);
  return letters(normaliseEmail(b.email).split("@")[0]).slice(0, 5) || "WEBC";
}

/** The next free BASE01..BASE99 given codes already taken. */
export function nextCustomerCode(base: string, taken: string[]): string {
  const re = new RegExp(`^${base}(\\d{2})$`, "i");
  const used = new Set(taken.map((c) => re.exec(c.trim())?.[1]).filter(Boolean).map(Number));
  for (let n = 1; n <= 99; n++) if (!used.has(n)) return `${base}${String(n).padStart(2, "0")}`;
  throw new Error(`No free customer code left for ${base}`);
}

function personName(b: Billing): string {
  return [b.first_name, b.last_name].map((s) => s?.trim()).filter(Boolean).join(" ");
}

function address(type: "Postal" | "Shipping", a: Billing) {
  return {
    AddressType: type,
    AddressName: personName(a) || a.company?.trim() || "",
    StreetAddress: a.address_1 || "",
    StreetAddress2: a.address_2 || "",
    Suburb: a.city || "",
    City: a.city || "",
    Region: a.state || "",
    PostalCode: a.postcode || "",
    Country: a.country || "Australia",
  };
}

/**
 * The new Customer. Named for the business when one was given, since that is
 * who the invoice is for (TAFE NSW, not the teacher who ordered); the person is
 * the contact either way.
 */
export function buildCustomerPayload(
  b: Billing,
  opts: { guid: string; code: string; shipping?: Billing; paymentIntentId?: string; now?: Date }
): Record<string, unknown> {
  const person = personName(b);
  const company = b.company?.trim();
  const day = (opts.now ?? new Date()).toISOString().slice(0, 10);
  return {
    Guid: opts.guid,
    CustomerCode: opts.code,
    CustomerName: company || person || normaliseEmail(b.email),
    ContactFirstName: b.first_name?.trim() || "",
    ContactLastName: b.last_name?.trim() || "",
    Email: normaliseEmail(b.email),
    PhoneNumber: b.phone?.trim() || "",
    ...NEW_CUSTOMER_DEFAULTS,
    Addresses: [
      ...(b.address_1 ? [address("Postal", b)] : []),
      ...(opts.shipping?.address_1 || b.address_1 ? [address("Shipping", opts.shipping?.address_1 ? opts.shipping : b)] : []),
    ],
    Notes:
      `Created by the masterkraft.com checkout on ${day}` +
      (opts.paymentIntentId ? ` for Stripe payment ${opts.paymentIntentId}` : "") +
      ". Web orders are booked to the buyer's own customer so the invoice is addressed to them.",
  };
}

// ---------------------------------------------------------------------------
// Network.
// ---------------------------------------------------------------------------

function headers(query: string): Record<string, string> {
  return {
    "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
    "api-auth-signature": createHmac("sha256", process.env.UNLEASHED_API_KEY ?? "").update(query, "utf8").digest("base64"),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function listCustomers(query: string): Promise<RawCustomer[]> {
  const res = await fetch(`${BASE}/Customers?${query}`, {
    headers: headers(query),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Unleashed ${res.status} on Customers?${query}`);
  const data = (await res.json()) as { Items?: RawCustomer[] };
  return data.Items ?? [];
}

async function createCustomer(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE}/Customers/${body.Guid}`, {
    method: "POST",
    headers: headers(""),
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Unleashed Customer create ${res.status}: ${text.slice(0, 300)}`);
  }
}

/** Never throws: every failure is a fallback with a reason. */
export async function resolveBuyerCustomer(
  billing: Billing,
  opts: { shipping?: Billing; paymentIntentId?: string } = {}
): Promise<ResolvedCustomer> {
  const email = normaliseEmail(billing.email);
  if (!email) return { how: "fallback", reason: "no buyer email" };
  try {
    const prefix = emailQueryPrefix(email);
    if (prefix.length < 3) return { how: "fallback", reason: `can't search Unleashed for ${email}` };
    const match = pickMatch(email, await listCustomers(`contactEmail=${prefix}&pageSize=200`));
    if ("customer" in match) {
      return { how: "matched", ref: { Guid: match.customer.Guid }, code: match.customer.CustomerCode };
    }
    if ("ambiguous" in match) {
      return { how: "fallback", reason: `${email} is on several customers (${match.ambiguous.join(", ")})` };
    }

    const base = customerCodeBase(billing);
    const taken = (await listCustomers(`customer=${base}&pageSize=200`)).map((c) => c.CustomerCode);
    const code = nextCustomerCode(base, taken);
    const guid = randomUUID();
    await createCustomer(buildCustomerPayload(billing, { guid, code, ...opts }));
    return { how: "created", ref: { Guid: guid }, code };
  } catch (e) {
    console.error("[unleashed-customers] falling back to the web account", e);
    return { how: "fallback", reason: e instanceof Error ? e.message.slice(0, 160) : "lookup failed" };
  }
}
