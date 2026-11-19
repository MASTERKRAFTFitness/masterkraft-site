import { headers } from "next/headers";
import { SITE_URL, isIndexableHost } from "@/lib/site";

// The decision lives in lib/site.ts so it can be tested without faking a
// request. Reading the host header makes this route dynamic, which is the right
// trade for a file this small: it is the difference between staging being
// crawlable and not.
//
// A ROUTE, NOT app/robots.ts, since 12 Nov 2026. Next's MetadataRoute.Robots
// has no way to write a Content-Signal line, and the page audit asked for one.
// The output is otherwise what robots.ts produced; robotsTxt() builds it so the
// test can read it without a request.

// Content-Signal (contentsignals.org) says what the site's content may be used
// for. search and ai-input are what SEO and AI-answer visibility need: being
// indexed, and being quoted in answers with a link. ai-train is left unstated
// on purpose: whether models may be trained on the site is a business call,
// not an SEO fix, and unstated means no preference either way.
const CONTENT_SIGNAL = "search=yes, ai-input=yes";

// /portal is NOT disallowed, deliberately. Its pages duplicate the public
// content pages, so they carry `robots: noindex` (see portal/layout.tsx) - and
// a Disallow would stop Google fetching them, which means never reading that
// noindex. A blocked URL can still be indexed from links alone; the only way to
// get a page OUT is to let the crawler in to be told to leave. The same applies
// to anything else added here that has a noindex: block crawling OR ask for
// removal, never both.
const DISALLOW = ["/cart", "/checkout", "/api/", "/wholesale-login", "/admin"];

export function robotsTxt(indexable: boolean): string {
  if (!indexable) return "User-Agent: *\nDisallow: /\n";
  return [
    "User-Agent: *",
    `Content-Signal: ${CONTENT_SIGNAL}`,
    "Allow: /",
    ...DISALLOW.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");
}

export async function GET() {
  const indexable = isIndexableHost((await headers()).get("host"));
  return new Response(robotsTxt(indexable), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
