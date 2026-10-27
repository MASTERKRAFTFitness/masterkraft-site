// Who gets to turn a PaymentIntent into an order. See
// supabase/migrations/20261026_order_claims.sql for why this exists.
//
// SERVER ONLY. FAILS OPEN: with no database, or no table yet, every caller is
// told to go ahead. That is exactly the behaviour before this file existed, and
// it is the right side to fail on - refusing would leave a paid customer with no
// order, while a duplicate is visible in Unleashed and can be cancelled.
import { adminDb } from "@/lib/admin-db";

// A claim older than this with no order number is a placement that crashed or
// timed out. Long enough that a slow Unleashed write is never stolen from.
const STALE_MS = 5 * 60 * 1000;

export type Claim = { won: true } | { won: false; orderNumber: string | null };

export async function claimOrder(paymentIntentId: string): Promise<Claim> {
  const db = adminDb();
  if (!db) return { won: true };
  try {
    const { error } = await db.from("order_claims").insert({ payment_intent_id: paymentIntentId });
    if (!error) return { won: true };
    // 23505: the row exists, so someone else claimed it first.
    if (error.code !== "23505") {
      console.warn("[order-claims] claim failed, proceeding without a lock", error.message);
      return { won: true };
    }
    const { data } = await db
      .from("order_claims")
      .select("claimed_at, order_number")
      .eq("payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (data?.order_number) return { won: false, orderNumber: data.order_number };
    const age = data?.claimed_at ? Date.now() - new Date(data.claimed_at).getTime() : 0;
    if (age > STALE_MS) {
      // Take the stale claim over, but only if it is still the stale one: a
      // conditional update, so two callers cannot both take it.
      const { data: taken } = await db
        .from("order_claims")
        .update({ claimed_at: new Date().toISOString() })
        .eq("payment_intent_id", paymentIntentId)
        .eq("claimed_at", data!.claimed_at)
        .is("order_number", null)
        .select("payment_intent_id");
      if (taken?.length) return { won: true };
    }
    return { won: false, orderNumber: null };
  } catch (e) {
    console.warn("[order-claims] claim crashed, proceeding without a lock", e);
    return { won: true };
  }
}

/** Mark the claim done. Never throws. */
export async function completeClaim(paymentIntentId: string, orderNumber: string): Promise<void> {
  const db = adminDb();
  if (!db) return;
  try {
    await db.from("order_claims").update({ order_number: orderNumber }).eq("payment_intent_id", paymentIntentId);
  } catch (e) {
    console.warn("[order-claims] could not complete claim", e);
  }
}

/** Give the claim back after a failed placement, so a retry can try again. Never throws. */
export async function releaseClaim(paymentIntentId: string): Promise<void> {
  const db = adminDb();
  if (!db) return;
  try {
    await db.from("order_claims").delete().eq("payment_intent_id", paymentIntentId).is("order_number", null);
  } catch (e) {
    console.warn("[order-claims] could not release claim", e);
  }
}
