import { NextResponse } from "next/server";
import { fulfilPaymentIntent, type FulfilInput } from "@/lib/fulfil-order";

// Called after the customer pays. Verifies the PaymentIntent succeeded and that
// the paid amount matches the SERVER-repriced total, then places the order.
//
// The card checkout posts the cart and address with the intent id. The return
// page for Afterpay and Zip (/checkout/complete) posts only the intent id, and
// the cart and address come from the intent itself. See lib/fulfil-order.
//
// WHICH SYSTEM the order lands in is lib/orders' business, not this route's.
export async function POST(request: Request) {
  let payload: FulfilInput;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const { status, body } = await fulfilPaymentIntent(payload);
  return NextResponse.json(body, { status });
}
