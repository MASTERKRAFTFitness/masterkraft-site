import { NextResponse } from "next/server";
import { servedCodes } from "@/lib/erp-catalogue";
import { getUnleashedMap } from "@/lib/unleashed";

// Which lines in a cart are no longer sold.
//
// THE CART OUTLIVES THE CATALOGUE. It lives in the browser's localStorage, so a
// product added last week is still in the basket after the product itself stops
// being served - retired in the ERP, moved to a portal brand, or hidden because
// nobody has measured its carton. The customer then reaches a checkout they
// cannot complete, for a product they can no longer open to remove: the only way
// out is emptying the whole cart.
//
// That is exactly what happened with `MMBXG01` Cotton Inners on 2026-09-06.
//
// SERVABILITY IS THE ERP'S ANSWER NOW. A code is sold if servedCodes() holds
// it, which is built from the same two sources the listings are - the ERP units
// behind /equipment, and the snapshot pages behind Clearance - so this cannot
// disagree with what the customer can actually open.
//
// IT WAS erpUnits() ALONE UNTIL 2026-09-06, AND THAT EMPTIED LIVE BASKETS.
// erpUnits is brand-filtered and Clearance deliberately is not, so every
// clearance line was reported unavailable and dropped on the next page load -
// AMKBUR01, AWWPCP01 and ABCTDR01 among them, all three sellable and on sale.
// See servedCodes.
//
// FAILS OPEN, DELIBERATELY. If the ERP cannot be reached this returns nothing
// unavailable rather than guessing, because emptying somebody's basket over a
// timeout is far worse than leaving a stale line in it. The checkout still
// refuses to charge for something it cannot price.

export const runtime = "nodejs";

type Body = { skus?: unknown };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ unavailable: [] });
  }

  const skus = Array.isArray(body.skus)
    ? body.skus.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];
  if (skus.length === 0) return NextResponse.json({ unavailable: [] });

  try {
    const map = await getUnleashedMap();
    // An empty map means the ERP did not answer. Fail open.
    if (Object.keys(map).length === 0) return NextResponse.json({ unavailable: [] });

    const served = servedCodes(map);

    const unavailable = skus.filter((s) => !served.has(s.trim().toUpperCase()));
    return NextResponse.json({ unavailable });
  } catch {
    return NextResponse.json({ unavailable: [] });
  }
}
