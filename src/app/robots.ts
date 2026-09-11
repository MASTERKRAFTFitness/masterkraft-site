import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SITE_URL, isIndexableHost } from "@/lib/site";

// The decision lives in lib/site.ts so it can be tested without faking a
// request. Reading the host header makes this route dynamic, which is the right
// trade for a file this small: it is the difference between staging being
// crawlable and not.
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (!isIndexableHost((await headers()).get("host"))) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /portal is NOT here, deliberately. Its pages duplicate the public
      // content pages, so they carry `robots: noindex` (see portal/layout.tsx)
      // - and a Disallow would stop Google fetching them, which means never
      // reading that noindex. A blocked URL can still be indexed from links
      // alone; the only way to get a page OUT is to let the crawler in to be
      // told to leave. The same applies to anything else added here that has a
      // noindex: block crawling OR ask for removal, never both.
      disallow: ["/cart", "/checkout", "/api/", "/wholesale-login", "/admin"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
