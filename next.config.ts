import type { NextConfig } from "next";

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
    ];
  },
};

export default nextConfig;
