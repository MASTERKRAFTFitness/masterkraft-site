import type { Metadata } from "next";

// The page itself is a client component, so it cannot export metadata and was
// inheriting the site-wide default title ("MASTERKRAFT | Shop Home Gym &
// Commercial Fitness Equipment"). A segment layout is the way to give it its own.
//
// noindex because a cart is per-visitor and has nothing to rank for. The whole
// site is noindex on staging today, so this only matters once
// NEXT_PUBLIC_ALLOW_INDEX is turned on.
export const metadata: Metadata = {
  title: "Cart",
  description: "Review the equipment in your cart and request a tailored quote.",
  robots: { index: false, follow: true },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
