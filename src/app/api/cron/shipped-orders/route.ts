// "Your order is on its way" emails, off dispatches recorded in Unleashed.
//
// Schedule: vercel.json, hourly.
// Logic:    lib/shipped-notices.ts. Off until SHIPPED_EMAILS_FROM is set.
//
// A dispatch notice to the person who bought is a transactional message about
// their own order, not a commercial one, so unlike cron/abandoned-checkouts this
// one does email the customer.
import { NextResponse } from "next/server";
import { sendShippedNotices } from "@/lib/shipped-notices";

export const dynamic = "force-dynamic";

/** FAIL CLOSED, same as cron/erp-mirror: no CRON_SECRET, no run. */
function authorised(req: Request): { ok: true } | { ok: false; status: number; why: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, why: "CRON_SECRET is not set on this deployment." };
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, why: "Unauthorised." };
  }
  return { ok: true };
}

export async function GET(req: Request) {
  const auth = authorised(req);
  if (!auth.ok) {
    console.warn(`[cron/shipped-orders] refused: ${auth.why}`);
    return NextResponse.json({ ok: false, error: auth.why }, { status: auth.status });
  }
  try {
    const result = await sendShippedNotices();
    console.log(
      `[cron/shipped-orders] ${result.checked} shipments, ${result.sent.length} emailed, ` +
        `${result.reviews.length} review requests, ${result.waiting} waiting, ${result.failed.length} failed${result.error ? ` (${result.error})` : ""}`
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[cron/shipped-orders] failed", error);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
