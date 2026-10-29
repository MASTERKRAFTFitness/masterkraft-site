import { NextResponse } from "next/server";
import { resolveOrderLines, type CartRef } from "@/lib/order-lines";
import { alreadyRedeemed, evaluatePromo } from "@/lib/promo-codes";

// Lets the checkout SHOW a promo code's discount before payment. It decides
// nothing: /api/payment-intent checks the code again against the cart it
// charges for. See lib/promo-codes.
export async function POST(request: Request) {
  let code: unknown, items: CartRef[], email: unknown;
  try {
    ({ code, items, email } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ ok: false, error: "Your cart is empty." }, { status: 400 });
  }

  let total: number;
  try {
    ({ total } = await resolveOrderLines(items));
  } catch {
    return NextResponse.json({ ok: false, error: "We couldn't check that code just now. Please try again." }, { status: 422 });
  }

  const verdict = evaluatePromo(code, total);
  if (!verdict.ok) return NextResponse.json({ ok: false, error: verdict.error }, { status: 422 });

  // Only when the email is already typed. Without it the code is shown and the
  // one-use rule is applied at payment, where the email is required.
  if (verdict.promo.onePerCustomer && typeof email === "string" && email.trim()) {
    try {
      if (await alreadyRedeemed(verdict.promo.code, email)) {
        return NextResponse.json(
          { ok: false, error: `${verdict.promo.code} has already been used with this email.` },
          { status: 422 }
        );
      }
    } catch (e) {
      console.error("[promo/check] redemption lookup failed", e);
      return NextResponse.json({ ok: false, error: "We couldn't check that code just now. Please try again." }, { status: 503 });
    }
  }

  return NextResponse.json({
    ok: true,
    code: verdict.promo.code,
    discount: verdict.discount,
    minSpendOver: verdict.promo.minSpendOver,
  });
}
