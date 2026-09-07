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
      disallow: ["/cart", "/checkout", "/api/", "/wholesale-login", "/portal", "/admin"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
