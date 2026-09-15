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

      // THREE HOODIE URLS BECAME ONE, 2026-09-11, and both of the dead ones
      // point at the survivor rather than at each other.
      //
      // The ERP held one garment as two complete code series - MAACU02-S/M/L/XL
      // unpriced and MAACU02S/M/L/XL at $81.82 - plus a spelling, "Oversided
      // Hoodie (XL)", that differed from its own siblings and so grouped as a
      // third product: a one-size hoodie page, in the sitemap, served for
      // months. Correcting the spelling merged it into its range, and retiring
      // the unpriced series (Michael's rule: keep the priced record) left
      // /product/oversized-hoodie-unisex as the only one.
      //
      // Both sources are pointed straight at the survivor. Chaining
      // /oversided- -> /oversized- -> /oversized-hoodie-unisex would cost every
      // visitor a second round trip and dilute the signal across two hops.
      { source: "/product/oversided-hoodie", destination: "/product/oversized-hoodie-unisex", permanent: true },
      { source: "/product/oversized-hoodie", destination: "/product/oversized-hoodie-unisex", permanent: true },

      // FIVE MORE SLUGS MOVED BY FIXING ERP SPELLINGS, 2026-09-15. A product's
      // URL is derived from its ProductDescription, so correcting "Multi-sation"
      // to "Multi-station" in Unleashed renames the page as well as the heading.
      // All five old URLs were in the sitemap and served, so all five are
      // redirected rather than left to 404 - the same lesson the hoodie taught
      // four days earlier, applied before it could bite this time.
      { source: "/product/4-stack-multi-sation", destination: "/product/4-stack-multi-station", permanent: true },
      { source: "/product/5-stack-multi-sation", destination: "/product/5-stack-multi-station", permanent: true },
      { source: "/product/8-stack-multi-sation", destination: "/product/8-stack-multi-station", permanent: true },
      { source: "/product/station-markets-set-of-20", destination: "/product/station-markers-set-of-20", permanent: true },
      {
        source: "/product/urethane-fixed-dumbbells-set-1-10kg-pairs-and-vertical-dummbell-rack",
        destination: "/product/urethane-fixed-dumbbells-set-1-10kg-pairs-and-vertical-dumbbell-rack",
        permanent: true,
      },

      // THE DUPLICATE MACHINES, retired 2026-09-15 by switching Sellable off
      // (Unleashed refuses Obsolete on a product with open transactions, and
      // the site excludes an unsellable product either way). Each points at the
      // record that survived it — Michael's rule: keep the priced one.
      //
      // /product/standing-hip-thrust is NOT here and must not be: MSLBPL28 was
      // only half of that page. MSLBSE07, the selectorised machine at
      // $3,427.27, still carries the name, so the URL still serves — and now
      // serves one machine instead of presenting two as size options of one.
      { source: "/product/multi-dead-lift", destination: "/product/multi-deadlift", permanent: true },
      { source: "/product/standing-hip-abductor", destination: "/product/standing-abductor", permanent: true },

      // THE WORDPRESS SUBCATEGORY URLS, found in Semrush on 2026-09-15 rather
      // than in the 404 log — because nobody is clicking them, Google is just
      // still ranking them.
      //
      // The old store nested a subcategory under its category:
      // /equipment/body-weight/gymnastics/. This site routes /equipment/[category]
      // as ONE segment and expresses the subgroup as ?sub=, so every one of those
      // URLs has answered 404 since the cutover. That one is ranked 45 for
      // "wooden gymnastic rings" and 44 for "wooden gym rings" — 160 searches a
      // month between them, both climbing — and it points at nothing. The
      // products are still on the site and ?sub=gymnastics still lists them.
      //
      // A PARAMETER RATHER THAN A LIST, because the old subcategory slugs are
      // not enumerated anywhere in this repo and a list would only cover the
      // ones we happened to think of. An unknown :sub is safe: the category page
      // ignores a filter it does not recognise and shows the whole category, so
      // the worst outcome is the right category page instead of a 404.
      {
        source: "/equipment/:category/:sub",
        destination: "/equipment/:category?sub=:sub",
        permanent: true,
      },

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
