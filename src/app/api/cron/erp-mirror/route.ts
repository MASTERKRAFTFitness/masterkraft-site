// The scheduled refresh of the Unleashed mirror. Vercel Cron calls this.
//
// Schedule: vercel.json, hourly at :17.
// Work:     lib/erp-mirror.ts, shared with `npm run mirror:erp`.
// Read by:  lib/unleashed.ts, but only when ERP_MIRROR_ENABLED is true.
//
// WHY THE SCHEDULE IS THE POINT, not a nicety. The read path ignores a mirror
// older than six hours and falls back to live Unleashed. That ceiling exists
// because on 18 September the table was ELEVEN DAYS old — `mirror:erp:write` was
// run by hand, and nobody had. Without something refreshing this, turning
// ERP_MIRROR_ENABLED on buys a cache that silently stops being used the moment
// it goes stale, which is the worst of both: the complexity of a mirror and the
// cold start of not having one.
//
// Hourly against a six-hour ceiling means five consecutive failures before the
// site notices, and the site's reaction is to be correct but slow. That is the
// right way round.
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { refreshErpMirror } from "@/lib/erp-mirror";

// The refresh reads ~9 pages of Products and ~3 of StockOnHand sequentially and
// takes about 80 seconds against a healthy ERP. api/admin/agent already runs at
// 300, so this ceiling is known to work on this account.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * FAIL CLOSED. Vercel attaches `Authorization: Bearer $CRON_SECRET` to a cron
 * request when that variable is set on the project. If it is NOT set, this route
 * refuses rather than running openly — an unauthenticated endpoint that pages a
 * rate-limited ERP and writes the product catalogue is not something to leave
 * lying around because a variable was forgotten.
 */
function authorised(req: Request): { ok: true } | { ok: false; status: number; why: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: 503,
      why: "CRON_SECRET is not set on this deployment, so this route refuses to run. Set it in Vercel and redeploy.",
    };
  }
  const offered = req.headers.get("authorization");
  // Constant-time-ish: lengths differ far more often than contents, and this is
  // a bearer token on a cron endpoint rather than a password.
  if (offered !== `Bearer ${secret}`) {
    return { ok: false, status: 401, why: "Unauthorised." };
  }
  return { ok: true };
}

export async function GET(req: Request) {
  const auth = authorised(req);
  if (!auth.ok) {
    console.warn(`[cron/erp-mirror] refused: ${auth.why}`);
    return NextResponse.json({ ok: false, error: auth.why }, { status: auth.status });
  }

  try {
    const result = await refreshErpMirror({ write: true });

    if (!result.ok) {
      // A refusal is not a crash. The shrink guard doing its job is the system
      // working, and it must be loud rather than silent — a mirror that stops
      // refreshing goes stale, and stale means the read path quietly stops
      // using it. 500 so the Vercel cron log shows it red.
      console.error(`[cron/erp-mirror] ${result.reason}`, result);
      return NextResponse.json(result, { status: 500 });
    }

    // Drop the cached maps so the refreshed rows are served now rather than up
    // to ten minutes from now. Tagged "unleashed", same as the live map — both
    // are the catalogue and both are stale the moment this finishes.
    // `{ expire: 0 }` because Next 16 requires the profile argument; same shape
    // api/opinly/route.ts already uses.
    revalidateTag("unleashed", { expire: 0 });

    console.log(
      `[cron/erp-mirror] ${result.written} written, ${result.pruned} pruned, ` +
        `${result.read} read (${result.withPrice} priced, ${result.withCarton} cartoned) in ${result.ms}ms`
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[cron/erp-mirror] threw: ${message}`);
    // The mirror is unchanged: the upsert is the only writer and it throws
    // before the prune. The site is unaffected either way — a failed refresh
    // ages the mirror, and an aged mirror is ignored in favour of Unleashed.
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
