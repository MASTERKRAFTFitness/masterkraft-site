// The tool surface for the /admin support agent.
//
// Reads come from the same modules the public site uses, so the agent can never
// quote a price the shop does not show. Writes are marked `write: true` and are
// NEVER executed here - the route holds them for human approval first. See
// src/app/api/admin/agent/route.ts.

import type Anthropic from "@anthropic-ai/sdk";
import { allProducts, productBySlug, searchCatalogue } from "@/lib/catalogue";
import { isForeignBrandSku, type WcProduct } from "@/lib/woocommerce";
import { isRetiredSku } from "@/lib/obsolete";
import { parseProductDetail } from "@/lib/spec";
import { enrich, getUnleashedMap } from "@/lib/unleashed";
import { collectionAddress, quoteFreight, type FreightItem } from "@/lib/freight";
import { getOrder, listRecentOrders, ordersConfigured, summariseOrder } from "@/lib/wc-admin";
import { submitHubspotForm } from "@/lib/hubspot";

export type ToolInput = Record<string, unknown>;

export type AgentTool = {
  definition: Anthropic.Tool;
  /** Write tools are proposed to the operator and only run after approval. */
  write?: boolean;
  run: (input: ToolInput) => Promise<unknown>;
  /** One line the approval card shows instead of raw JSON. */
  describe?: (input: ToolInput) => string;
};

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
};
const dim = (v: unknown): number => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function findProduct(reference: string): WcProduct | undefined {
  const ref = reference.trim();
  const bySlug = productBySlug(ref.toLowerCase());
  if (bySlug) return bySlug;
  const upper = ref.toUpperCase();
  const bySku = allProducts().find((p) => (p.sku ?? "").toUpperCase() === upper);
  if (bySku) return bySku;
  return searchCatalogue(ref)[0];
}

// ---------------------------------------------------------------- read tools

const searchCatalogueTool: AgentTool = {
  definition: {
    name: "search_catalogue",
    description:
      "Search the MasterKraft product catalogue by name, SKU or keyword. Returns matching products with SKU, slug and the price the website shows. Use this first when a customer names a product loosely.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Product name, SKU or keyword, e.g. 'C2 rower' or 'MCTMSP02'." },
        limit: { type: "number", description: "Maximum results, default 8, max 25." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  run: async (input) => {
    const results = searchCatalogue(str(input.query)).slice(0, Math.min(num(input.limit, 8) || 8, 25));
    if (!results.length) return { results: [], note: "No catalogue match. Try a shorter or different keyword." };
    const map = await getUnleashedMap();
    return {
      results: results.map((p) => {
        const e = enrich(p, map);
        return {
          name: p.name,
          sku: p.sku || null,
          slug: p.slug,
          price: e.priceLabel,
          in_stock: e.inStock,
          stock_qty: e.stockQty ?? null,
          price_source: e.source,
          retired: isRetiredSku(p.sku),
        };
      }),
    };
  },
};

const getProductTool: AgentTool = {
  definition: {
    name: "get_product",
    description:
      "Full detail for one product: description, specifications, live Unleashed price and stock, and the carton weight and dimensions freight is quoted from. Accepts a SKU, a slug, or a product name.",
    input_schema: {
      type: "object",
      properties: {
        reference: { type: "string", description: "SKU, URL slug, or product name." },
      },
      required: ["reference"],
      additionalProperties: false,
    },
  },
  run: async (input) => {
    const product = findProduct(str(input.reference));
    if (!product) return { error: "No product found for that reference." };
    const map = await getUnleashedMap();
    const e = enrich(product, map);
    const detail = parseProductDetail(product);
    const weight = dim(product.weight);
    const length = dim(product.dimensions?.length);
    const width = dim(product.dimensions?.width);
    const height = dim(product.dimensions?.height);
    return {
      name: product.name,
      sku: product.sku || null,
      slug: product.slug,
      url: `/product/${product.slug}`,
      price: e.priceLabel,
      price_source: e.source,
      in_stock: e.inStock,
      stock_qty: e.stockQty ?? null,
      retired: isRetiredSku(product.sku),
      foreign_brand: isForeignBrandSku(product.sku),
      categories: product.categories?.map((c) => c.name) ?? [],
      overview: detail.overviewDescription || detail.overviewShort || product.short_description || null,
      features: detail.features ?? [],
      specifications: detail.specs ?? [],
      // Carton, not assembled size. Freight is quoted from these, so a wrong
      // figure here is a wrong delivery charge - say so rather than guessing.
      carton: weight && length && width && height
        ? { weight_kg: weight, length_cm: length, width_cm: width, height_cm: height }
        : null,
      carton_note:
        weight && length && width && height
          ? "Shipping carton dimensions. Freight is quoted from these."
          : "INCOMPLETE carton data - this product cannot be freight-quoted online and must go to the quote flow.",
    };
  },
};

const checkStockTool: AgentTool = {
  definition: {
    name: "check_stock",
    description:
      "Live price and available stock from Unleashed (the ERP) for one or more SKUs. Unleashed is the source of truth for both; prices returned are GST-inclusive.",
    input_schema: {
      type: "object",
      properties: {
        skus: { type: "array", items: { type: "string" }, description: "Up to 20 SKUs." },
      },
      required: ["skus"],
      additionalProperties: false,
    },
  },
  run: async (input) => {
    const skus = Array.isArray(input.skus) ? input.skus.map((s) => str(s)).filter(Boolean).slice(0, 20) : [];
    if (!skus.length) return { error: "Provide at least one SKU." };
    const map = await getUnleashedMap();
    const products = allProducts();
    return {
      results: skus.map((sku) => {
        const product = products.find((p) => (p.sku ?? "").toUpperCase() === sku.toUpperCase());
        if (!product) return { sku, found: false, note: "Not in the catalogue snapshot." };
        const e = enrich(product, map);
        return {
          sku,
          found: true,
          name: product.name,
          price: e.priceLabel,
          price_source: e.source,
          in_stock: e.inStock,
          stock_qty: e.stockQty ?? null,
          retired: isRetiredSku(sku),
        };
      }),
    };
  },
};

const lookupOrderTool: AgentTool = {
  definition: {
    name: "lookup_order",
    description:
      "Look up one WooCommerce order by its number, e.g. 490118. Returns status, totals, customer contact, delivery address and line items. Orders flow on to Unleashed as sales orders under the same number.",
    input_schema: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "The order number as the customer quotes it." },
      },
      required: ["order_number"],
      additionalProperties: false,
    },
  },
  run: async (input) => {
    if (!ordersConfigured()) return { error: "WooCommerce credentials are not configured." };
    const order = await getOrder(str(input.order_number)).catch((e: Error) => ({ error: e.message }));
    if (!order) return { error: "No order found with that number." };
    if ("error" in order) return order;
    return summariseOrder(order);
  },
};

const recentOrdersTool: AgentTool = {
  definition: {
    name: "list_recent_orders",
    description:
      "List the most recent WooCommerce orders, newest first. Use to answer 'what has come in today' or to find an order when the customer does not have the number.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many, default 10, max 25." },
        status: {
          type: "string",
          description: "Optional WooCommerce status filter, e.g. processing, pending, on-hold, completed.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  run: async (input) => {
    if (!ordersConfigured()) return { error: "WooCommerce credentials are not configured." };
    const orders = await listRecentOrders(num(input.limit, 10) || 10, str(input.status) || undefined);
    return { count: orders.length, orders: orders.map(summariseOrder) };
  },
};

const freightTool: AgentTool = {
  definition: {
    name: "quote_freight",
    description:
      "Quote Australia Post delivery to a customer's address for a list of SKUs. Returns the same prices the website checkout would show, GST inclusive with margin applied. Returns a reason instead of a price when the goods are pallet freight or the carton data is missing.",
    input_schema: {
      type: "object",
      properties: {
        postcode: { type: "string" },
        suburb: { type: "string", description: "Delivery suburb or city." },
        state: { type: "string", description: "State code, e.g. VIC." },
        items: {
          type: "array",
          description: "Line items to quote.",
          items: {
            type: "object",
            properties: { sku: { type: "string" }, qty: { type: "number" } },
            required: ["sku", "qty"],
            additionalProperties: false,
          },
        },
      },
      required: ["postcode", "suburb", "items"],
      additionalProperties: false,
    },
  },
  run: async (input) => {
    if (!collectionAddress()) return { error: "Freight is not configured (no collection address)." };
    const rawItems = Array.isArray(input.items) ? (input.items as ToolInput[]) : [];
    if (!rawItems.length) return { error: "Provide at least one item." };

    const products = allProducts();
    const items: FreightItem[] = [];
    const unknown: string[] = [];
    for (const raw of rawItems) {
      const sku = str(raw.sku);
      const quantity = Math.max(1, Math.floor(num(raw.qty, 1)));
      const product = products.find((p) => (p.sku ?? "").toUpperCase() === sku.toUpperCase());
      if (!product) {
        unknown.push(sku);
        continue;
      }
      items.push({
        sku: product.sku ?? sku,
        name: product.name,
        quantity,
        weightKg: dim(product.weight),
        lengthCm: dim(product.dimensions?.length),
        widthCm: dim(product.dimensions?.width),
        heightCm: dim(product.dimensions?.height),
      });
    }
    if (!items.length) return { error: "None of those SKUs are in the catalogue.", unknown };

    const quote = await quoteFreight(items, {
      city: str(input.suburb),
      state: str(input.state),
      postcode: str(input.postcode),
      country: "AU",
    });
    return { ...quote, unknown_skus: unknown.length ? unknown : undefined };
  },
};

// --------------------------------------------------------------- write tools
// Neither of these runs until the operator approves it in the console.

const sendReplyTool: AgentTool = {
  definition: {
    name: "send_reply",
    description:
      "Send an email reply to a customer from the MasterKraft quotes address. Requires human approval before it is sent, so draft the full message and propose it - do not ask the operator to confirm in chat first.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address." },
        subject: { type: "string" },
        body: { type: "string", description: "Plain text body. Line breaks are preserved." },
      },
      required: ["to", "subject", "body"],
      additionalProperties: false,
    },
  },
  write: true,
  describe: (input) => `Email ${str(input.to)} - "${str(input.subject)}"`,
  run: async (input) => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.QUOTE_FROM_EMAIL;
    if (!apiKey || !from) return { error: "Email is not configured (RESEND_API_KEY / QUOTE_FROM_EMAIL)." };
    const body = str(input.body);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [str(input.to)],
        reply_to: process.env.QUOTE_TO_EMAIL || undefined,
        subject: str(input.subject),
        text: body,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6">${escapeHtml(body).replace(/\n/g, "<br/>")}</div>`,
      }),
    });
    if (!res.ok) return { error: `Resend ${res.status}`, sent: false };
    return { sent: true, to: str(input.to) };
  },
};

const logEnquiryTool: AgentTool = {
  definition: {
    name: "log_enquiry",
    description:
      "Record a customer enquiry in HubSpot against the quote form, so a phone or email enquiry lands in the CRM alongside website submissions. Requires human approval.",
    input_schema: {
      type: "object",
      properties: {
        first_name: { type: "string" },
        last_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        company: { type: "string" },
        message: { type: "string", description: "What they asked for, including SKUs and quantities." },
      },
      required: ["first_name", "email", "message"],
      additionalProperties: false,
    },
  },
  write: true,
  describe: (input) =>
    `Log HubSpot enquiry for ${str(input.first_name)} ${str(input.last_name)} <${str(input.email)}>`,
  run: async (input) => {
    const result = await submitHubspotForm(
      process.env.HUBSPOT_FORM_QUOTE,
      [
        { name: "firstname", value: str(input.first_name) },
        { name: "lastname", value: str(input.last_name) },
        { name: "email", value: str(input.email) },
        { name: "phone", value: str(input.phone) },
        { name: "company", value: str(input.company) },
        { name: "message", value: str(input.message) },
      ],
      { pageName: "Admin console enquiry" }
    ).catch((e: Error) => `error: ${e.message}`);
    return { hubspot: result };
  },
};

function escapeHtml(s: string) {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c);
}

// Order is stable on purpose: the tool list is part of the cached prompt prefix,
// so reshuffling it would invalidate the cache on every request.
export const AGENT_TOOLS: AgentTool[] = [
  searchCatalogueTool,
  getProductTool,
  checkStockTool,
  lookupOrderTool,
  recentOrdersTool,
  freightTool,
  sendReplyTool,
  logEnquiryTool,
];

export const TOOL_DEFINITIONS: Anthropic.Tool[] = AGENT_TOOLS.map((t) => t.definition);

export function toolByName(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((t) => t.definition.name === name);
}

export function describeToolCall(name: string, input: ToolInput): string {
  const tool = toolByName(name);
  return tool?.describe?.(input) ?? `${name}(${JSON.stringify(input).slice(0, 160)})`;
}
