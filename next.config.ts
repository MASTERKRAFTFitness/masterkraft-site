import type { NextConfig } from "next";
import legacyRedirects from "./src/data/legacy-redirects.json";

const nextConfig: NextConfig = {
  images: {
    // Every image the site serves now lives in /public (the 27 August mirror), and
    // all of it is already re-encoded at q88 by scripts/compress-assets.py - the
    // product shots average 71 KB. Routing that through Vercel's optimiser bought
    // us very little and cost us the whole quota: with the default deviceSizes /
    // imageSizes, ~900 source images fan out to ~14,000 transformations, and the
    // account's allowance is well under that. Once it was spent, every optimised
    // request returned 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED and the images
    // went blank sitewide, while the same files served fine at their /public path.
    // Serving them unoptimised is free, cannot run out, and keeps next/image's
    // lazy-loading and layout reservation. If this is ever turned back on, trim
    // deviceSizes first - each extra width is another billable transformation.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "masterkraft.com" },
      { protocol: "https", hostname: "www.masterkraft.com" },
      // Per-size range photography (2026-09-02). The /public mirror holds one
      // shot per PRODUCT, taken from WooCommerce parents; it has nothing for the
      // 258+ individual sizes, whose only photographs are the ERP's. Public,
      // no auth, ~100 KB each. Listed here so re-enabling the optimiser does not
      // silently blank every range page; mirroring these into /public the way
      // scripts/mirror-product-images.mjs did is the way to drop the dependency.
      { protocol: "https", hostname: "unlappcdn.unleashedsoftware.com" },
    ],
  },
  async redirects() {
    return [
      // WooCommerce used "packages-2"; storefront uses "packages"
      { source: "/equipment/packages-2", destination: "/equipment/packages", permanent: true },
      // Reformers was a category from 2026-08-27 to 2026-09-02 and never held a
      // product. The ERP files both reformers under Cardio, so that is where the
      // URL now goes rather than to a 404.
      { source: "/equipment/reformers", destination: "/equipment/cardio", permanent: true },
      // Common legacy entry points
      { source: "/shop", destination: "/all-equipment", permanent: true },
      { source: "/equipment", destination: "/all-equipment", permanent: true },
      { source: "/home", destination: "/", permanent: true },

      // FOUND BY THE 404 LOG, 2026-09-06 — the first thing it caught within
      // minutes of going live. Both are WordPress-era URLs that the outside
      // world still asks for: `/about` is the page every site is assumed to
      // have, and `/sample-page` is WordPress's own default, which means it was
      // published and indexed at some point. Neither was linked from here, so
      // neither was visible from inside the site — exactly the blind spot
      // src/lib/not-found-log.ts exists to cover.
      { source: "/about", destination: "/our-story", permanent: true },
      { source: "/sample-page", destination: "/", permanent: true },

      // THE WORDPRESS ERA. The cutover on 27 August moved the apex to this site,
      // and everything the old store served that this one does not has been
      // answering 404 ever since: 69 `/product-category/<slug>` archives (the
      // biggest of them covered 106 products) and 225 product URLs the four
      // visibility rules exclude. None of it was linked from here — the internal
      // link graph is clean — so it is invisible from inside the site and only
      // shows up as inbound traffic dying.
      //
      // Generated, not hand-written, because "what does this site refuse to
      // serve" is a question only the visibility rules can answer, and a
      // redirect whose source still serves would delete a working page: these
      // are matched BEFORE routing. See scripts/legacy-redirects.report.ts for
      // the ERP-rescue trap that makes that a live risk.
      ...legacyRedirects.redirects.map((r) => ({ ...r, permanent: true })),
    ];
  },
};

export default nextConfig;
