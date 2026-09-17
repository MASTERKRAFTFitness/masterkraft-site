import { headers } from "next/headers";
import { getUnleashedMap } from "@/lib/unleashed";
import { buildFeed, feedToXml } from "@/lib/merchant-feed";
import { isIndexableHost } from "@/lib/site";

export const runtime = "nodejs";

// Merchant Center fetches a feed on a schedule — daily is the usual setting —
// and an hour of cache means a price or stock change reaches Google within the
// hour without every fetch walking the whole ERP catalogue.
export const revalidate = 3600;

/**
 * The Google Merchant Center product feed, at /merchant-feed.xml.
 *
 * STAGING MUST NOT SERVE IT. The same reasoning as robots.ts: a feed fetched
 * from a preview host advertises preview URLs, and Merchant Center will happily
 * accept them and send paid traffic to a deployment nobody is watching. The
 * host check is shared with robots so the two cannot disagree about which
 * deployment is the real one.
 */
export async function GET() {
  if (!isIndexableHost((await headers()).get("host"))) {
    return new Response("Not found", { status: 404 });
  }

  const map = await getUnleashedMap().catch(() => null);
  // A FEED THAT CANNOT READ THE ERP MUST NOT BE AN EMPTY FEED. Merchant Center
  // reads zero items as "everything was withdrawn" and disapproves the lot; the
  // next good fetch then has to win approval back. A 503 is read as a fetch
  // failure and the previous feed stays live, which is the truthful answer when
  // Unleashed is down.
  if (!map) {
    return new Response("Catalogue unavailable", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }

  const { items } = buildFeed(map);
  if (!items.length) {
    return new Response("Catalogue empty", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }

  return new Response(feedToXml(items), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
