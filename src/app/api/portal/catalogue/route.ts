// Route: /api/portal/catalogue?portal=hq|partner
//
// What a portal shows, read from THIS project so there is one copy of the
// decision rather than two databases disagreeing about it.
//
// The portals run on a different Supabase project (witpevhhgthpimqbstql) and
// cannot read portal_products directly. The alternative was syncing a slim copy
// across on a schedule, which is a second mirror to keep honest - and the image
// mirror drifted in four separate ways in a single day before anyone counted
// it. One source, fetched over HTTP, is the cheaper mistake to live with.
//
// FAILS CLOSED, the same shape as /api/cron/erp-mirror. If PORTAL_API_SECRET is
// not set this refuses rather than answering openly: it returns the product
// list, prices and stock for the whole range, which is not something to leave
// readable because a variable was forgotten.
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/admin-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORTALS = new Set(["hq", "partner"]);

function authorised(req: Request): { ok: true } | { ok: false; status: number; why: string } {
  const secret = process.env.PORTAL_API_SECRET;
  if (!secret) {
    return {
      ok: false, status: 503,
      why: "PORTAL_API_SECRET is not set on this deployment, so this route refuses to run. Set it in Vercel and redeploy.",
    };
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, why: "Unauthorised." };
  }
  return { ok: true };
}

export async function GET(req: Request) {
  const auth = authorised(req);
  if (!auth.ok) {
    console.warn(`[portal/catalogue] refused: ${auth.why}`);
    return NextResponse.json({ ok: false, error: auth.why }, { status: auth.status });
  }

  const portal = new URL(req.url).searchParams.get("portal") ?? "";
  if (!PORTALS.has(portal)) {
    return NextResponse.json(
      { ok: false, error: `portal must be one of ${[...PORTALS].join(", ")}` },
      { status: 400 },
    );
  }

  const db = adminDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: "Database is not configured." }, { status: 503 });
  }

  // portal_catalogue_v already applies `show` and joins the name, price, stock,
  // copy and image. Paged, because .select() stops at 1,000 rows by default and
  // a silent truncation here would read as "we stopped selling those".
  const rows: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("portal_catalogue_v")
      .select("erp_code, name, category, erp_price, stock, sellable, obsolete, overview, features, image_url, sort_order, note")
      .eq("portal", portal)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
      .range(from, from + 999);
    if (error) {
      console.error(`[portal/catalogue] ${error.message}`);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    rows.push(...data);
    if (data.length < 1000) break;
  }

  // A marker whose product has left Unleashed comes back with a null name. It
  // is REPORTED rather than filtered: a portal quietly showing fewer products
  // than were curated is the failure that takes weeks to notice.
  const stale = rows.filter((r) => (r as { name: string | null }).name === null).length;

  return NextResponse.json({
    ok: true,
    portal,
    count: rows.length,
    staleMarkers: stale,
    generatedAt: new Date().toISOString(),
    products: rows,
  });
}
