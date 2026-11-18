// The hourly refresh of erp_customers, the Supabase copy of Unleashed's
// customers that the checkout matches web buyers against.
//
// Schedule: vercel.json, hourly at :37 (the product mirror runs at :17).
// Work:     lib/erp-customers.ts.
// Read by:  lib/unleashed-customers.ts, which refuses a copy more than 48 hours
//           old and books orders to the shared web account instead.
//
// Incremental: only customers changed since the newest one held, less two
// hours. `?full=1` reads all ~4,300 (about 22 pages) for a first fill or to
// catch customers deleted in Unleashed.
import { NextResponse } from "next/server";
import { refreshErpCustomers } from "@/lib/erp-customers";

// A full read is ~22 slow pages; Unleashed answered single customer pages in
// 3-37s on 18 Nov. Incremental runs are one or two pages.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** FAIL CLOSED, as /api/cron/erp-mirror: no CRON_SECRET, no run. */
function authorised(req: Request): { ok: true } | { ok: false; status: number; why: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 503, why: "CRON_SECRET is not set on this deployment, so this route refuses to run." };
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return { ok: false, status: 401, why: "Unauthorised." };
  return { ok: true };
}

export async function GET(req: Request) {
  const auth = authorised(req);
  if (!auth.ok) {
    console.warn(`[cron/erp-customers] refused: ${auth.why}`);
    return NextResponse.json({ ok: false, error: auth.why }, { status: auth.status });
  }
  const full = new URL(req.url).searchParams.get("full") === "1";
  try {
    const result = await refreshErpCustomers({ full, write: true });
    if (!result.ok) {
      console.error(`[cron/erp-customers] ${result.reason}`, result);
      return NextResponse.json(result, { status: 500 });
    }
    console.log(`[cron/erp-customers] ${result.written} written of ${result.read} read since ${result.since ?? "the start"} in ${result.ms}ms`);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron/erp-customers] threw: ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
