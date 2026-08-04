import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "masterkraft.com" },
      { protocol: "https", hostname: "www.masterkraft.com" },
    ],
  },
  async redirects() {
    return [
      // WooCommerce used "packages-2"; storefront uses "packages"
      { source: "/equipment/packages-2", destination: "/equipment/packages", permanent: true },
      // Common legacy entry points
      { source: "/shop", destination: "/all-equipment", permanent: true },
      { source: "/equipment", destination: "/all-equipment", permanent: true },
      { source: "/home", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
