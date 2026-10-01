import { NextResponse } from "next/server";
import { getUnleashedMapLive } from "@/lib/unleashed";
import { cartLineForCode } from "@/lib/checkout-link";

// The cart line for one ERP code — what /checkout?id={id} adds. See
// lib/checkout-link.ts.
//
// LIVE, NOT THE MIRROR, for the same reason as ../check: this feeds the step
// immediately before payment, and the price it hands the browser is what the
// shopper sees on the checkout. The charge path re-prices regardless.

export const runtime = "nodejs";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id || id.length > 64) return NextResponse.json({ line: null }, { status: 400 });

  try {
    const map = await getUnleashedMapLive();
    const line = Object.keys(map).length ? cartLineForCode(map, id) : null;
    return NextResponse.json({ line }, { status: line ? 200 : 404 });
  } catch {
    return NextResponse.json({ line: null }, { status: 503 });
  }
}
