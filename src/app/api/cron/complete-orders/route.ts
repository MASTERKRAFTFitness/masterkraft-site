// Complete shipped website orders in Unleashed, which raises their invoices.
//
// Schedule: vercel.json, hourly, ten minutes after shipped-orders.
// Logic:    lib/complete-on-ship.ts. Off until UNLEASHED_COMPLETE_ON_SHIP_FROM is set.
import { NextResponse } from "next/server";
import { runCompleteOnShip } from "@/lib/complete-on-ship";

export const dynamic = "force-dynamic";

/** FAIL CLOSED, same as the other crons: no CRON_SECRET, no run. */
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
    console.warn(`[cron/complete-orders] refused: ${auth.why}`);
    return NextResponse.json({ ok: false, error: auth.why }, { status: auth.status });
  }
  try {
    const r = await runCompleteOnShip();
    console.log(
      `[cron/complete-orders] ${r.shipped} shipped, ${r.invoiced.length} invoiced, ` +
        `${r.alreadyInvoiced.length} already invoiced, ${r.problems.length} problems, ${r.retrying} retrying` +
        `${r.error ? ` (${r.error})` : ""}`,
      r.invoiced.length || r.problems.length ? { invoiced: r.invoiced, problems: r.problems } : ""
    );
    return NextResponse.json(r, { status: r.ok ? 200 : 503 });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[cron/complete-orders] failed", error);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
