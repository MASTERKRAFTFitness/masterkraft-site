// The tool surface for the /admin support agent.
//
// Reads come from the same modules the public site uses, so the agent can never
// quote a price the shop does not show. Writes are marked `write: true` and are
// NEVER executed here - the route holds them for human approval first. See
// src/app/api/admin/agent/route.ts.

import type Anthropic from "@anthropic-ai/sdk";
import {
  allProducts,
  productBySku,
  productBySlug,
  searchCatalogue,
  variationBySku,
} from "@/lib/catalogue";
import { formatPrice, isPortalOnlyBrand, type WcProduct } from "@/lib/woocommerce";
import { isRetiredSku } from "@/lib/obsolete";
import { parseProductDetail } from "@/lib/spec";
import {
  enrich,
  getLiveEntries,
  getSalesOrder,
  getShipmentsForOrder,
  getUnleashedMap,
} from "@/lib/unleashed";
import { collectionAddress, quoteFreight } from "@/lib/freight";
import { refsToFreightItems, type CartRefLike } from "@/lib/freight-server";
import { submitHubspotForm } from "@/lib/hubspot";
import { stripe, stripeEnabled } from "@/lib/stripe";

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

// Sizes come from three different places that are easy to confuse, so they are
// returned separately and never merged:
//   assembled  - ACF meta, millimetres. What the machine measures once built.
//   packing    - ACF meta, millimetres. The carton as the supplier states it.
//   freight    - WcProduct.dimensions, CENTIMETRES. What AusPost is quoted from.
// Weight splits the same way: net is the machine, gross is machine plus carton,
// and freight quotes on gross.
//
// A plausibility check runs over the result because the catalogue is known to
// carry unit errors: SCRWAR04 records its assembled length as 24,400mm, which is
// 24 metres and ten times the real figure, and the freight carton inherited it.
// Flagging that is the difference between a staff member catching it and reading
// it out to a customer.
const MAX_PLAUSIBLE_MM = 4000;
const MAX_PLAUSIBLE_KG = 1000;

function metaNumber(product: WcProduct, key: string): number | null {
  const raw = product.meta_data?.find((m) => m.key === key)?.value;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = parseFloat(String(raw).replace(/,/g, "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sizeFacts(product: WcProduct) {
  const mm = (k: string) => metaNumber(product, k);
  const assembled = {
    length_mm: mm("assembled_size_length"),
    width_mm: mm("assembled_size_width"),
    depth_mm: mm("assembled_size_depth"),
    height_mm: mm("assembled_size_height"),
  };
  const packing = {
    length_mm: mm("packing_size_length"),
    width_mm: mm("packing_size_width"),
    height_mm: mm("packing_size_height"),
  };
  const netKg = mm("net_weight");
  const grossKg = mm("gross_weight");
  const freight = {
    length_cm: dim(product.dimensions?.length),
    width_cm: dim(product.dimensions?.width),
    height_cm: dim(product.dimensions?.height),
    weight_kg: dim(product.weight),
  };

  const warnings: string[] = [];
  for (const [k, v] of Object.entries(assembled)) {
    if (v && v > MAX_PLAUSIBLE_MM) {
      warnings.push(
        `Assembled ${k.replace("_mm", "")} reads ${v}mm (${(v / 1000).toFixed(1)}m), which is implausible for gym equipment. Likely a unit error in the product record. Confirm before quoting.`
      );
    }
  }
  if (freight.length_cm > MAX_PLAUSIBLE_MM / 10 || freight.width_cm > MAX_PLAUSIBLE_MM / 10) {
    warnings.push(
      "Freight carton dimensions look implausibly large, so any delivery price quoted from them will be wrong. Confirm before quoting."
    );
  }
  if (netKg && grossKg && netKg > MAX_PLAUSIBLE_KG) {
    warnings.push(`Net weight reads ${netKg}kg, which is implausible. Confirm before quoting.`);
  }

  return {
    assembled_size: Object.values(assembled).some(Boolean) ? assembled : null,
    packing_size: Object.values(packing).some(Boolean) ? packing : null,
    net_weight_kg: netKg,
    gross_weight_kg: grossKg,
    freight_carton: freight.weight_kg && freight.length_cm ? freight : null,
    weight_note:
      netKg && grossKg && netKg !== grossKg
        ? `Net ${netKg}kg is the machine, gross ${grossKg}kg includes the carton. Delivery is priced on gross.`
        : null,
    size_note:
      "assembled_size and packing_size are in MILLIMETRES; freight_carton is in CENTIMETRES. Never quote the carton as the machine's footprint.",
    data_warnings: warnings.length ? warnings : null,
  };
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
      basis:
        "Prices and stock here come from the shared 60-minute catalogue cache, because a search can span many products. Call check_stock or get_product before quoting either to a customer.",
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
    // Live, not the 60-minute map: a staff member repeats this to a customer.
    const live = product.sku ? (await getLiveEntries([product.sku]))[product.sku.toUpperCase()] : null;
    const map = live ? null : await getUnleashedMap();
    const e = map ? enrich(product, map) : null;
    const detail = parseProductDetail(product);
    const weight = dim(product.weight);
    const length = dim(product.dimensions?.length);
    const width = dim(product.dimensions?.width);
    const height = dim(product.dimensions?.height);
    return {
      ...sizeFacts(product),
      name: product.name,
      sku: product.sku || null,
      slug: product.slug,
      url: `/product/${product.slug}`,
      price: live && live.price > 0 ? formatPrice(live.price) : e?.priceLabel ?? "Contact for pricing",
      price_source: live?.live ? "unleashed (live)" : live ? "unleashed (cached fallback)" : e?.source ?? "website",
      in_stock: live ? live.stock > 0 : e?.inStock ?? false,
      stock_qty: live ? live.stock : e?.stockQty ?? null,
      stock_basis: live?.live ? "read live from the ERP just now" : "up to 60 minutes old, the live read failed",
      retired: isRetiredSku(product.sku),
      // Not "we don't sell it" — it is sold through the franchisee portals and
      // the catalogues rather than listed on masterkraft.com.
      portal_only_brand: isPortalOnlyBrand(product.sku),
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
    const skus = Array.isArray(input.skus) ? input.skus.map((s) => str(s)).filter(Boolean).slice(0, 10) : [];
    if (!skus.length) return { error: "Provide at least one SKU." };
    // Read live rather than from the shared 60-minute map. This is the number a
    // staff member turns into a promise on the phone, so an hour of drift is the
    // difference between holding the last unit and overselling it.
    const entries = await getLiveEntries(skus);
    const products = allProducts();
    return {
      results: skus.map((sku) => {
        const product = products.find((p) => (p.sku ?? "").toUpperCase() === sku.toUpperCase());
        if (!product) return { sku, found: false, note: "Not in the catalogue snapshot." };
        const entry = entries[sku.toUpperCase()];
        return {
          sku,
          found: true,
          name: product.name,
          price: entry && entry.price > 0 ? formatPrice(entry.price) : "Contact for pricing",
          price_source: entry?.live ? "unleashed (live)" : "unleashed (cached fallback, up to 60 min old)",
          in_stock: (entry?.stock ?? 0) > 0,
          stock_qty: entry?.stock ?? null,
          retired: isRetiredSku(sku),
        };
      }),
      basis: "Read live from Unleashed at the time of this call unless a row says otherwise.",
    };
  },
};

// ---------------------------------------------------------------------------
// ORDER READS COME OFF UNLEASHED, 2026-09-18.
//
// These three tools read WooCommerce until today, through lib/wc-admin.ts, which
// is now deleted. That reader had been answering nothing useful for twelve days:
// WC_STORE_URL is this storefront, so every call 404'd, and the tools reported
// "No order found with that number" for orders that plainly existed.
//
// Unleashed is where orders have been written since 6 Sep, so it is where they
// are read from. What the ERP does not carry, the tools no longer claim: there
// is no delivery address or payment-method title on a SalesOrder, and
// `list_recent_orders` is gone entirely because the ERP has no "newest orders"
// endpoint to back it. Finding an order without its number is now a job for
// Unleashed itself.
// ---------------------------------------------------------------------------

const lookupOrderTool: AgentTool = {
  definition: {
    name: "lookup_order",
    description:
      "Look up one order by its number, e.g. 490118. Reads the sales order in Unleashed and returns status, order date, total, line items and the email addresses recorded against it. Use for any 'what did I order' or 'what is happening with my order' question.",
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
    const reference = str(input.order_number).trim();
    if (!reference) return { error: "Provide an order number." };
    const order = await getSalesOrder(reference).catch((e: Error) => e);
    if (order instanceof Error) return { error: order.message };
    if (!order) return { error: "No order found with that number." };
    return {
      order: order.orderNumber,
      status: order.status,
      placed: order.orderedAt,
      total: order.total === null ? null : `AUD ${order.total.toFixed(2)}`,
      emails: order.emails,
      paid_by_card: Boolean(order.stripeRef),
      lines: order.lines.map((l) => ({ code: l.code, name: l.name, qty: l.qty })),
      basis: "Read live from Unleashed, which is where website orders are written.",
    };
  },
};

const checkShipmentTool: AgentTool = {
  definition: {
    name: "check_shipment",
    description:
      "Whether an order has been dispatched, when, and with which carrier and tracking number. Reads the dispatch record in Unleashed. Use for any 'where is my delivery' question, before quoting freight or apologising for a delay.",
    input_schema: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "The order number, e.g. 490118." },
      },
      required: ["order_number"],
      additionalProperties: false,
    },
  },
  run: async (input) => {
    const reference = str(input.order_number).trim();
    if (!reference) return { error: "Provide an order number." };

    const shipments = await getShipmentsForOrder(reference).catch((e: Error) => e);
    if (shipments instanceof Error) return { error: shipments.message };

    if (!shipments.length) {
      // No dispatch record. Distinguish "not shipped yet" from "no such order",
      // otherwise a typo reads back as a delayed delivery.
      //
      // THIS ASKED WOOCOMMERCE UNTIL 2026-09-18, and got null every time, so a
      // real order awaiting dispatch was reported as a number that does not
      // exist — the exact confusion the branch was written to prevent. It asks
      // Unleashed now, which is the system the order is actually in.
      const order = await getSalesOrder(reference).catch(() => null);
      if (!order) {
        return {
          order: reference,
          found: false,
          note: "No dispatch record and no matching order. Check the number before telling the customer anything.",
        };
      }
      return {
        order: order.orderNumber,
        dispatched: false,
        order_status: order.status,
        placed: order.orderedAt,
        note: "The order exists but has not been dispatched. This is not a missing record, it means it has not left yet.",
      };
    }

    return {
      order: reference,
      dispatched: true,
      shipments: shipments.map((s) => ({
        shipment: s.shipmentNumber,
        status: s.status,
        dispatched_at: s.dispatchedAt,
        tracking_number: s.trackingNumber,
        carrier: s.carrier,
        packages: s.packages,
        weight_kg: s.weightKg,
        deliver_to: s.deliverTo,
        lines: s.lineCount,
        // The common case by a wide margin. Say what we know rather than
        // implying the goods are unaccounted for.
        tracking_note: s.trackingNumber
          ? null
          : "Dispatched, but no tracking number or carrier was recorded against it. The goods went out; the paperwork was completed in the carrier's own system rather than here. To trace it, the despatch team needs to look it up with the carrier.",
      })),
    };
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
  // THE CARTON IS RESOLVED BY THE CHECKOUT'S OWN RESOLVER, not read off the
  // snapshot here. This tool promises "the same prices the website checkout
  // would show" and, reading product.dimensions directly, it did not keep that
  // promise for any product the snapshot measures wrongly. refsToFreightItems
  // skips a carton that could not be real, lets a contradicting ERP record
  // overrule a believable but wrong one, and maps the ERP's axis order - so
  // MWBBFUR03 was quoted here as an 11.6cm parcel while the checkout consigned
  // the 116cm bar it actually is. One resolver, one answer.
  //
  // It also reaches VARIATIONS, which is what a range's sizes are. Matching SKUs
  // against allProducts() alone could not price a single size of a range: every
  // one of them came back as a code we do not sell.
  run: async (input) => {
    if (!collectionAddress()) return { error: "Freight is not configured (no collection address)." };
    const rawItems = Array.isArray(input.items) ? (input.items as ToolInput[]) : [];
    if (!rawItems.length) return { error: "Provide at least one item." };

    const refs: CartRefLike[] = [];
    const unknown: string[] = [];
    for (const raw of rawItems) {
      const sku = str(raw.sku);
      const quantity = Math.max(1, Math.floor(num(raw.qty, 1)));
      const product = productBySku(sku);
      if (product) {
        refs.push({ productId: product.id, quantity, sku: product.sku ?? sku });
        continue;
      }
      const sized = variationBySku(sku);
      if (sized) {
        refs.push({
          productId: sized.productId,
          variationId: sized.variation.id,
          quantity,
          sku: sized.variation.sku || sku,
        });
        continue;
      }
      unknown.push(sku);
    }
    if (!refs.length) return { error: "None of those SKUs are in the catalogue.", unknown };
    const items = await refsToFreightItems(refs);

    const quote = await quoteFreight(items, {
      city: str(input.suburb),
      state: str(input.state),
      postcode: str(input.postcode),
      country: "AU",
    });
    return { ...quote, unknown_skus: unknown.length ? unknown : undefined };
  },
};

const checkPaymentTool: AgentTool = {
  definition: {
    name: "check_payment",
    description:
      "Whether an order was actually paid, and what happened to that payment: card type and last four digits, refunds, and disputes. Reads Stripe directly rather than trusting the order status. Use when a customer asks whether their payment went through, or about a refund.",
    input_schema: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "The order number, e.g. 490118." },
      },
      required: ["order_number"],
      additionalProperties: false,
    },
  },
  run: async (input) => {
    const reference = str(input.order_number).trim();
    if (!reference) return { error: "Provide an order number." };
    // The Stripe id came off the Woo order's `transaction_id` until 2026-09-18.
    // It now comes off the "Stripe: pi_…" line buildComments writes into the
    // Unleashed order, which is the only remaining join from an order number to
    // a payment.
    const order = await getSalesOrder(reference).catch(() => null);
    if (!order) return { error: "No order found with that number." };

    const base = {
      order: order.orderNumber,
      order_status: order.status,
      order_total: order.total === null ? null : `AUD ${order.total.toFixed(2)}`,
      placed: order.orderedAt,
    };

    if (!order.stripeRef) {
      return { ...base, stripe: null, note: "No Stripe reference on this order, so it was not a card payment through the site." };
    }
    if (!stripeEnabled() || !stripe) {
      return { ...base, stripe_ref: order.stripeRef, error: "STRIPE_SECRET_KEY is not set, so the payment itself cannot be checked." };
    }

    try {
      const pi = await stripe.paymentIntents.retrieve(order.stripeRef, { expand: ["latest_charge"] });
      const charge = pi.latest_charge && typeof pi.latest_charge !== "string" ? pi.latest_charge : null;
      const card = charge?.payment_method_details?.card;
      return {
        ...base,
        stripe_ref: pi.id,
        payment_status: pi.status,
        amount: `${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}`,
        card: card ? `${card.brand} ending ${card.last4}` : null,
        refunded: charge?.refunded ?? false,
        amount_refunded: charge ? `${(charge.amount_refunded / 100).toFixed(2)} ${pi.currency.toUpperCase()}` : null,
        disputed: charge?.disputed ?? false,
        // A test-mode key cannot see a live payment and vice versa. Saying which
        // mode answered stops "not found" being read as "never paid".
        stripe_mode: pi.livemode ? "live" : "test",
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ...base,
        stripe_ref: order.stripeRef,
        error: `Stripe could not find that payment: ${message}`,
        note: "If the site is running test Stripe keys, a real customer payment is invisible to them. That is a key mismatch, not a missing payment. Do not tell a customer they have not paid on the strength of this.",
      };
    }
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
        // Every sent reply lands in the inbox the team already reads. Without
        // this the only copy lives in Resend's dashboard, which nobody opens,
        // so "as per your email" would be unanswerable.
        bcc: process.env.QUOTE_TO_EMAIL ? [process.env.QUOTE_TO_EMAIL] : undefined,
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
  // recentOrdersTool was here until 2026-09-18. It listed WooCommerce's newest
  // orders, and Unleashed has no equivalent endpoint to repoint it at. Removing
  // it shifts every later tool up one position in the cached prompt prefix; that
  // is a one-off cache miss, not a reason to keep a tool that returns nothing.
  checkPaymentTool,
  checkShipmentTool,
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
