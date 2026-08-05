import type { MetadataRoute } from "next";
import { SITE_URL, ALLOW_INDEX } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Pre-launch (preview + staging): block all crawling entirely.
  if (!ALLOW_INDEX) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/cart", "/checkout", "/api/", "/wholesale-login", "/portal"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
