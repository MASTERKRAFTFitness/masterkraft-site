import { NextResponse } from "next/server";
import { quoteFreightForRefs, type DeliveryInput } from "@/lib/freight-server";

// Freight options for the checkout summary. The Australia Post key stays on the
// server, and the weights and dimensions are resolved from WooCommerce rather
// than trusted from the browser, so nobody can post a 1kg parcel for a 130kg
// rack and buy cheap freight.

export const runtime = "nodejs";

type Body = {
  items?: { productId?: number; variationId?: number; quantity?: number; sku?: string }[];
  delivery?: DeliveryInput;
  serviceId?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, reason: "error" }, { status: 400 });
  }

  // Keep a line that has EITHER handle. A size the old store never listed has
  // productId 0 and only its ERP code, and dropping it here would quote freight
  // for a lighter consignment than the one we actually ship.
  const refs = (body.items ?? [])
    .filter((i) => typeof i.productId === "number" || typeof i.sku === "string")
    .map((i) => ({
      productId: typeof i.productId === "number" ? i.productId : 0,
      variationId: i.variationId,
      quantity: i.quantity ?? 1,
      sku: typeof i.sku === "string" ? i.sku : undefined,
    }));
  if (refs.length === 0) {
    return NextResponse.json({ ok: false, reason: "error", detail: "no items" });
  }

  const decision = await quoteFreightForRefs(refs, body.delivery, body.serviceId);
  return NextResponse.json({
    ok: decision.selected !== null,
    required: decision.required,
    options: decision.options,
    selected: decision.selected,
    reason: decision.reason ?? null,
  });
}
