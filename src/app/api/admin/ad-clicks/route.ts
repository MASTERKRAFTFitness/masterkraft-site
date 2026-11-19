import { adminCookieFrom, adminSecret, readSession } from "@/lib/admin-auth";
import { markAdClickLeadsExported, recentAdClickLeads } from "@/lib/ad-click-leads";
import { offlineConversions, offlineConversionsCsv } from "@/lib/ad-offline-export";

// The Google Ads offline conversion CSV, from /admin/ad-clicks. See
// lib/ad-offline-export for what goes in and what stays out.
//
// POST, not GET, because it has a side effect: every row in the file is marked
// uploaded, so the next download does not send the same conversions twice. If
// the upload to Ads fails, nothing needs undoing here - the rows are still in
// the database, and the team can re-upload the same file.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // The proxy gates /api/admin optimistically; every admin route re-checks.
  const secret = adminSecret();
  const session = secret ? await readSession(adminCookieFrom(request), secret) : null;
  if (!session) return new Response("Not signed in", { status: 401 });

  const conversions = offlineConversions(await recentAdClickLeads(90, 2000));
  await markAdClickLeadsExported(conversions.map((c) => ({ kind: c.kind, ref: c.ref })));

  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
  return new Response(offlineConversionsCsv(conversions), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="google-ads-offline-conversions-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
