import { NextResponse } from "next/server";
import { quoteFreightForRefs, type DeliveryInput } from "@/lib/freight-server";

// Freight options for the checkout summary. The Interparcel key stays on the
// server, and the weights and dimensions are resolved from WooCommerce rather
// than trusted from the browser, so nobody can post a 1kg parcel for a 130kg
// rack and buy cheap freight.

export const runtime = "nodejs";

type Body = {
  items?: { productId?: number; variationId?: number; quantity?: number }[];
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

  const refs = (body.items ?? [])
    .filter((i) => typeof i.productId === "number")
    .map((i) => ({
      productId: i.productId as number,
      variationId: i.variationId,
      quantity: i.quantity ?? 1,
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
