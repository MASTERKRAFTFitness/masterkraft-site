// Complete a website order in Unleashed once it ships, so its invoice is raised
// and reaches Xero without anyone doing it by hand.
//
// WHY, 2026-11-19. Shuyi (accounts) described the web-order invoice process:
// the site books the order, then she waits for the Stripe payout to show in
// Xero, opens Unleashed, raises the invoice (the order goes Complete), exports
// it to Xero and reconciles. About a week from order to an invoice that could be
// sent. Web orders have been booked to the buyer's own customer since PR #138,
// so the invoice is already addressed right; raising it is the manual step left.
//
// AT SHIPPING, NOT AT PAYMENT. Completing an order takes its stock out, so it
// waits until the goods have gone. "Gone" is either signal, whichever is first:
//   - a label bought in Easyship (easyship_labels, from /api/easyship/webhook).
//     SO-00000877 and SO-00000909 went this way and were never marked
//     Dispatched in Unleashed: their shipments were still Parked on 19 Nov.
//   - a shipment marked Dispatched in Unleashed, for anything sent through
//     another carrier portal (SO-00000862/873/874 went this way).
// A split Easyship order ("SO-00000877 (1/2)") is completed on its first label;
// its labels are bought together.
//
// CHECKED, NOT TRUSTED. The API's Complete call is listed but not described,
// and the docs do not say it invoices the way the UI does. So after completing,
// the run reads the order's invoices back, and only a Completed invoice counts.
// A completion with no invoice is flagged for a person ("needs_check") and is
// not retried, because a retry would not change Unleashed's mind.
//
// NEVER TWICE. An order that already has a Completed invoice (raised by hand,
// as all of them were before this) is recorded and left alone. order_completions
// remembers every order between runs; failures retry up to MAX_ATTEMPTS and the
// team is told on the first failure and when retries run out, not every hour.
//
// OFF UNTIL UNLEASHED_COMPLETE_ON_SHIP_FROM IS SET. It is a date, like
// SHIPPED_EMAILS_FROM: only orders shipped on or after it are completed, so
// switching it on does not sweep up the back catalogue Shuyi is mid-way through.
//
// Only card orders the website took (a Stripe "pi_" on the order) are touched.
// A trade order's invoicing is the office's, on the office's terms.
import { adminDb } from "@/lib/admin-db";
import { internalRecipients } from "@/lib/notify-recipients";
import { isWebOrder } from "@/lib/shipped-notices";
import {
  getInvoicesForOrder,
  getSalesOrder,
  getShipmentsModifiedSince,
  type DispatchedShipment,
  type OrderInvoice,
  type SalesOrder,
} from "@/lib/unleashed";
import { completeSalesOrder } from "@/lib/unleashed-orders";
import type { SupabaseClient } from "@supabase/supabase-js";

const LOOKBACK_DAYS = 14;
export const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 8000;

export type Trigger = "easyship" | "unleashed";
export type Outcome = "pending" | "invoiced" | "already_invoiced" | "needs_check";

export type CompletionRow = {
  order_number: string;
  outcome: Outcome;
  trigger: Trigger | null;
  invoice_number: string | null;
  attempts: number;
  last_error: string | null;
};

/** The date from UNLEASHED_COMPLETE_ON_SHIP_FROM, or null when the feature is off. */
export function completeFrom(raw = process.env.UNLEASHED_COMPLETE_ON_SHIP_FROM): Date | null {
  const v = raw?.trim();
  // A real date only. new Date("1") is 2001, so "=1" would mean "everything".
  if (!v || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

/**
 * The orders that have shipped since `from`, each with what said so.
 *
 * Easyship first: a label is usually bought before anyone marks the Unleashed
 * shipment, so it is the earlier and more common signal. Dates compare by
 * calendar day, as shipped-notices does, because DispatchDate is midnight UTC.
 */
export function shippedOrders(
  labels: { order_number: string; created_at: string }[],
  shipments: DispatchedShipment[],
  opts: { from: Date; webCustomerCode: string }
): Map<string, Trigger> {
  const out = new Map<string, Trigger>();
  const since = day(opts.from);
  for (const l of labels) {
    if (l.order_number && day(l.created_at) >= since) out.set(l.order_number, "easyship");
  }
  for (const s of shipments) {
    if (out.has(s.orderNumber)) continue;
    if (s.status !== "Dispatched" || !s.dispatchedAt || day(s.dispatchedAt) < since) continue;
    if (!isWebOrder(s, opts.webCustomerCode)) continue;
    out.set(s.orderNumber, "unleashed");
  }
  return out;
}

/** An invoice that counts as "this order is invoiced": Completed, not Parked or Deleted. */
export function completedInvoice(invoices: OrderInvoice[]): OrderInvoice | null {
  return invoices.find((i) => i.status === "Completed") ?? null;
}

export type Step =
  | { action: "skip"; reason: string }
  | { action: "record"; outcome: "already_invoiced"; invoiceNumber: string }
  | { action: "flag"; reason: string }
  | { action: "complete" };

/** What to do with one shipped order. Pure, so the rules are tested rather than read. */
export function decideCompletion(
  order: Pick<SalesOrder, "status" | "stripeRef" | "guid"> | null,
  invoices: OrderInvoice[],
  row: Pick<CompletionRow, "outcome" | "attempts"> | null
): Step {
  if (row && row.outcome !== "pending") return { action: "skip", reason: `already ${row.outcome}` };
  if (row && row.attempts >= MAX_ATTEMPTS) return { action: "skip", reason: "out of retries" };
  if (!order) return { action: "skip", reason: "no such sales order" };
  // The labelled "Stripe: pi_..." line only the website writes. A trade order
  // keyed into Unleashed never carries one, whatever its CustomerRef says.
  if (!order.stripeRef) return { action: "skip", reason: "not a website card order" };
  if (order.status === "Deleted") return { action: "skip", reason: "order deleted" };
  const done = completedInvoice(invoices);
  if (done) return { action: "record", outcome: "already_invoiced", invoiceNumber: done.invoiceNumber };
  if (order.status === "Completed") return { action: "flag", reason: "order is Completed in Unleashed but has no Completed invoice" };
  if (!order.guid) return { action: "skip", reason: "no order Guid" };
  return { action: "complete" };
}

export type Deps = {
  getOrder: (orderNumber: string) => Promise<SalesOrder | null>;
  getInvoices: (orderNumber: string) => Promise<OrderInvoice[]>;
  complete: (guid: string) => Promise<unknown>;
  rows: (orderNumbers: string[]) => Promise<Map<string, CompletionRow>>;
  save: (row: CompletionRow) => Promise<void>;
};

export type CompletionResult = {
  invoiced: { order: string; invoice: string; trigger: Trigger }[];
  alreadyInvoiced: string[];
  /** New problems this run: first failures, retries run out, or no invoice after completing. */
  problems: { order: string; error: string; final: boolean }[];
  retrying: number;
};

/** Work through the shipped orders. Never throws for one order's failure. */
export async function completeShipped(shipped: Map<string, Trigger>, deps: Deps): Promise<CompletionResult> {
  const result: CompletionResult = { invoiced: [], alreadyInvoiced: [], problems: [], retrying: 0 };
  const existing = await deps.rows([...shipped.keys()]);

  for (const [orderNumber, trigger] of shipped) {
    const row = existing.get(orderNumber) ?? null;
    // Settled orders cost no Unleashed calls at all.
    if (row && row.outcome !== "pending") continue;
    if (row && row.attempts >= MAX_ATTEMPTS) continue;

    const attempts = (row?.attempts ?? 0) + 1;
    const base = { order_number: orderNumber, trigger, invoice_number: null, attempts, last_error: null };
    try {
      const order = await deps.getOrder(orderNumber);
      const invoices = order ? await deps.getInvoices(orderNumber) : [];
      const step = decideCompletion(order, invoices, row);
      if (step.action === "skip") continue;
      if (step.action === "record") {
        await deps.save({ ...base, attempts: row?.attempts ?? 0, outcome: "already_invoiced", invoice_number: step.invoiceNumber });
        result.alreadyInvoiced.push(orderNumber);
        continue;
      }
      if (step.action === "flag") {
        await deps.save({ ...base, attempts: row?.attempts ?? 0, outcome: "needs_check", last_error: step.reason });
        result.problems.push({ order: orderNumber, error: step.reason, final: true });
        continue;
      }

      await deps.complete(order!.guid!);
      const invoice = completedInvoice(await deps.getInvoices(orderNumber));
      if (invoice) {
        await deps.save({ ...base, outcome: "invoiced", invoice_number: invoice.invoiceNumber });
        result.invoiced.push({ order: orderNumber, invoice: invoice.invoiceNumber, trigger });
      } else {
        const error = "Unleashed accepted the completion but no Completed invoice is on the order";
        await deps.save({ ...base, outcome: "needs_check", last_error: error });
        result.problems.push({ order: orderNumber, error, final: true });
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      const final = attempts >= MAX_ATTEMPTS;
      await deps
        .save({ ...base, outcome: final ? "needs_check" : "pending", last_error: error.slice(0, 500) })
        .catch((err) => console.error("[complete-on-ship] could not record failure", orderNumber, err));
      // Told once when it first fails and once when it gives up, not every hour between.
      if (attempts === 1 || final) result.problems.push({ order: orderNumber, error, final });
      if (!final) result.retrying++;
    }
  }
  return result;
}

function escape(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] || c);
}

/** The team's summary of one run, or null when there is nothing to say. */
export function summaryEmail(r: CompletionResult): { subject: string; html: string } | null {
  if (!r.invoiced.length && !r.problems.length) return null;
  const parts = [];
  if (r.invoiced.length) {
    parts.push(
      `<p>These website orders have shipped, so the site completed them in Unleashed and their invoices are raised:</p>` +
        `<ul>${r.invoiced.map((x) => `<li>${escape(x.order)}: ${escape(x.invoice)} (shipped per ${x.trigger === "easyship" ? "Easyship label" : "Unleashed dispatch"})</li>`).join("")}</ul>` +
        `<p>Each is addressed to the buyer's own customer and paid by card through Stripe. Nothing to raise by hand; reconcile against the Stripe payout as usual.</p>`
    );
  }
  if (r.problems.length) {
    parts.push(
      `<p>These could not be completed automatically:</p>` +
        `<ul>${r.problems.map((x) => `<li>${escape(x.order)}: ${escape(x.error)}${x.final ? " <strong>(not retrying: please raise the invoice by hand)</strong>" : " (will retry next hour)"}</li>`).join("")}</ul>`
    );
  }
  return {
    subject: `Web order invoices: ${r.invoiced.length} raised${r.problems.length ? `, ${r.problems.length} need attention` : ""}`,
    html: parts.join(""),
  };
}

/** Who hears about it: COMPLETE_ON_SHIP_NOTIFY (accounts), else the usual list. */
export function notifyList(raw = process.env.COMPLETE_ON_SHIP_NOTIFY): string[] {
  return raw?.trim() ? internalRecipients(raw) : internalRecipients();
}

async function sendEmail(msg: { to: string[]; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("RESEND_API_KEY / QUOTE_FROM_EMAIL not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, ...msg }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
}

function storeDeps(db: SupabaseClient): Pick<Deps, "rows" | "save"> {
  return {
    async rows(orderNumbers) {
      const out = new Map<string, CompletionRow>();
      if (!orderNumbers.length) return out;
      const { data, error } = await db.from("order_completions").select("*").in("order_number", orderNumbers);
      if (error) throw new Error(`order_completions: ${error.message}`);
      for (const r of (data ?? []) as CompletionRow[]) out.set(r.order_number, r);
      return out;
    },
    async save(row) {
      const { error } = await db
        .from("order_completions")
        .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "order_number" });
      if (error) throw new Error(`order_completions: ${error.message}`);
    },
  };
}

export type RunResult = CompletionResult & { ok: boolean; error?: string; shipped: number };

/** One pass, for the cron. */
export async function runCompleteOnShip(now = new Date()): Promise<RunResult> {
  const empty: RunResult = { ok: true, shipped: 0, invoiced: [], alreadyInvoiced: [], problems: [], retrying: 0 };
  const from = completeFrom();
  if (!from) return { ...empty, error: "UNLEASHED_COMPLETE_ON_SHIP_FROM is not set; nothing completed" };
  const webCustomerCode = process.env.UNLEASHED_WEB_CUSTOMER_CODE?.trim();
  if (!webCustomerCode) return { ...empty, ok: false, error: "UNLEASHED_WEB_CUSTOMER_CODE is not set" };
  const db = adminDb();
  if (!db) return { ...empty, ok: false, error: "Supabase is not configured" };

  const lookback = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const since = lookback > from ? lookback : from;
  const { data: labels, error } = await db
    .from("easyship_labels")
    .select("order_number, created_at")
    .gte("created_at", since.toISOString());
  if (error) return { ...empty, ok: false, error: `easyship_labels: ${error.message}` };
  const shipments = await getShipmentsModifiedSince(since.toISOString());

  const shipped = shippedOrders(labels ?? [], shipments, { from, webCustomerCode });
  const result = await completeShipped(shipped, {
    getOrder: getSalesOrder,
    getInvoices: getInvoicesForOrder,
    complete: completeSalesOrder,
    ...storeDeps(db),
  });

  const email = summaryEmail(result);
  if (email) {
    await sendEmail({ to: notifyList(), ...email }).catch((e) => console.error("[complete-on-ship] team email failed", e));
  }
  return { ok: true, shipped: shipped.size, ...result };
}
