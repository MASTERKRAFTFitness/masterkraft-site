// The tool surface for the PUBLIC chat widget.
//
// This is deliberately a separate list from AGENT_TOOLS in tools.ts, not a
// filtered view of it. The internal tools were written for staff and are correct
// for staff: lookup_order returns a customer's name, email, phone and delivery
// address keyed on an order number alone, and list_recent_orders returns the
// last 25 orders with no customer scoping at all. Order numbers are sequential
// (490118), so exposing either of those to anonymous visitors would let anyone
// count upwards and harvest the customer list.
//
// The rule for this file: a tool belongs here only if every field it can return
// is something we would publish on the website anyway. The one exception is
// check_order_status, which returns a customer's own order and therefore has to
// prove who is asking first.
//
// If you add a tool here, ask what it returns on its worst input, not its
// intended one.

import type Anthropic from "@anthropic-ai/sdk";
import { getOrder, ordersConfigured } from "@/lib/wc-admin";
import { submitHubspotForm } from "@/lib/hubspot";
import { orderLookupBlocked, recordOrderMiss } from "@/lib/agent/rate-limit";
import { toolByName, type AgentTool, type ToolInput } from "@/lib/agent/tools";

/** Who is asking, so a tool can rate-limit or attribute. */
export type PublicContext = { visitor: string };

export type PublicTool = {
  definition: Anthropic.Tool;
  run: (input: ToolInput, ctx: PublicContext) => Promise<unknown>;
};

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

/**
 * Reuse an internal read tool, optionally stripping fields.
 *
 * Reusing the implementation rather than copying it is deliberate: the freight,
 * stock and catalogue logic is proven, and two copies would drift. What must not
 * be reused is the tool LIST.
 */
function reuse(name: string, redact?: (output: unknown) => unknown): PublicTool {
  const internal: AgentTool | undefined = toolByName(name);
  if (!internal) throw new Error(`public-tools: no internal tool named ${name}`);
  if (internal.write) throw new Error(`public-tools: ${name} is a write tool and cannot be public`);
  return {
    definition: internal.definition,
    run: async (input) => {
      const output = await internal.run(input);
      return redact ? redact(output) : output;
    },
  };
}

// get_product carries two fields that are internal bookkeeping rather than
// product facts. Stripping them here beats telling the model not to mention
// them: a prompt is a request, a delete is a guarantee.
function redactProduct(output: unknown): unknown {
  if (!output || typeof output !== "object") return output;
  const rest = { ...(output as Record<string, unknown>) };
  const retired = rest.retired === true;
  delete rest.foreign_brand;
  delete rest.retired;
  // Kept, because offering a discontinued machine to a customer is worse than
  // the small amount it reveals, but renamed to something customer-shaped.
  return { ...rest, available_to_order: !retired };
}

// ------------------------------------------------------------- order status

// Woo's internal status names mean nothing to a customer.
const STATUS_PLAIN: Record<string, string> = {
  pending: "Received, but payment has not come through yet.",
  processing: "Paid and being prepared for despatch.",
  "on-hold": "On hold. This usually means we are waiting on payment or confirming stock.",
  completed: "Despatched.",
  cancelled: "Cancelled.",
  refunded: "Refunded.",
  failed: "The payment did not complete, so the order has not been placed.",
};

const orderStatusTool: PublicTool = {
  definition: {
    name: "check_order_status",
    description:
      "Check the progress of a customer's own order. Requires BOTH the order number AND the email address the order was placed with: never call this with only one of them, ask the customer for the missing one. Returns the status, dates, items and totals. Does not return contact or address details.",
    input_schema: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "The order number as the customer quotes it, e.g. 490118." },
        email: { type: "string", description: "The email address the order was placed with. Required." },
      },
      required: ["order_number", "email"],
      additionalProperties: false,
    },
  },
  run: async (input, ctx) => {
    if (!ordersConfigured()) {
      return { error: "Order lookup is unavailable at the moment. Use the contact form and the team will check for you." };
    }

    const number = str(input.order_number).trim();
    const email = str(input.email).trim().toLowerCase();
    if (!number || !email) {
      return { matched: false, note: "Both the order number and the email address on the order are needed." };
    }

    if (orderLookupBlocked(ctx.visitor)) {
      return {
        matched: false,
        blocked: true,
        note: "Too many failed order lookups from this visitor. Do not try again in this conversation. Direct them to the contact form.",
      };
    }

    // One response for every failure, whatever the cause. Distinguishing "no
    // such order" from "wrong email" would turn this into an oracle that
    // confirms which order numbers are real, which is most of what an attacker
    // wants. The model is told to relay this wording rather than speculate.
    const miss = () => {
      const { blocked } = recordOrderMiss(ctx.visitor);
      return {
        matched: false,
        blocked,
        note: "Those details did not match an order. Ask the customer to check the order number and confirm which email address the order was placed with. Do not guess, and do not say whether the order number exists.",
      };
    };

    const order = await getOrder(number).catch(() => null);
    if (!order) return miss();

    // getOrder falls back to the first search hit when nothing matches exactly,
    // which is helpful for a staff member and dangerous here: it could hand back
    // somebody else's order. Public callers get exact matches only.
    if (String(order.number).trim() !== number) return miss();

    const onOrder = (order.billing?.email ?? "").trim().toLowerCase();
    if (!onOrder || onOrder !== email) return miss();

    return {
      matched: true,
      order_number: order.number,
      status: order.status,
      status_plain: STATUS_PLAIN[order.status] ?? "In progress.",
      placed: order.date_created ?? null,
      paid: Boolean(order.date_paid),
      total: `${order.currency ?? "AUD"} ${order.total}`,
      delivery_charged: order.shipping_total ?? null,
      items: (order.line_items ?? []).map((l) => ({ name: l.name, sku: l.sku || null, qty: l.quantity })),
      // No tracking number: the WooCommerce order payload this store returns has
      // no tracking field, so there is nothing to read. Saying "we cannot see a
      // tracking number here" is honest; inventing one is not.
      tracking: null,
      tracking_note:
        "Tracking numbers are not visible to this assistant. If the order is despatched and they want tracking, take it to the team through the contact form.",
    };
  },
};

// ------------------------------------------------------------ lead capture

const enquiryTool: PublicTool = {
  definition: {
    name: "log_enquiry",
    description:
      "Pass an enquiry to the MasterKraft team by recording it in the CRM, so a person follows it up by email. Use this when you cannot finish the job yourself: pallet freight quotes, anything about an existing order you could not verify, custom fitouts, wholesale, or a customer who asks to speak to someone. Ask for their name and email first, and confirm they are happy for you to pass it on. Tell them a person will be in touch.",
    input_schema: {
      type: "object",
      properties: {
        first_name: { type: "string" },
        last_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        company: { type: "string" },
        message: {
          type: "string",
          description: "What they asked for, in full, including SKUs, quantities and delivery postcode. Write it for a colleague picking this up cold.",
        },
      },
      required: ["first_name", "email", "message"],
      additionalProperties: false,
    },
  },
  // Unlike the internal build, this one executes immediately. There is no
  // operator sitting behind a public widget to approve anything, and the person
  // supplying the details is the customer themselves, which is exactly what the
  // website contact form already does without approval.
  run: async (input) => {
    const email = str(input.email).trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { logged: false, error: "That email address does not look valid. Ask the customer to confirm it." };
    }
    const result = await submitHubspotForm(
      process.env.HUBSPOT_FORM_QUOTE,
      [
        { name: "firstname", value: str(input.first_name) },
        { name: "lastname", value: str(input.last_name) },
        { name: "email", value: email },
        { name: "phone", value: str(input.phone) },
        { name: "company", value: str(input.company) },
        { name: "message", value: str(input.message) },
      ],
      { pageName: "Website chat assistant" }
    ).catch((e: Error) => `error: ${e.message}`);

    const failed = typeof result === "string" && result.startsWith("error:");
    return failed
      ? { logged: false, error: "The enquiry could not be recorded. Apologise and point them at the contact form on the website." }
      : { logged: true, note: "Recorded. Tell the customer a member of the team will be in touch by email." };
  },
};

// Stable order, same reason as the internal list: this renders ahead of the
// system prompt and both sit behind one cache breakpoint. Appending is safe,
// reshuffling costs a cache miss on every request.
export const PUBLIC_TOOLS: PublicTool[] = [
  reuse("search_catalogue"),
  reuse("get_product", redactProduct),
  reuse("check_stock"),
  reuse("quote_freight"),
  orderStatusTool,
  enquiryTool,
];

export const PUBLIC_TOOL_DEFINITIONS: Anthropic.Tool[] = PUBLIC_TOOLS.map((t) => t.definition);

export function publicToolByName(name: string): PublicTool | undefined {
  return PUBLIC_TOOLS.find((t) => t.definition.name === name);
}
