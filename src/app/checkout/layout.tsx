import type { Metadata } from "next";

// See the note in ../cart/layout.tsx: the page is a client component, so its
// title has to come from a segment layout.
//
// The heading switches between "Checkout" and "Request a Quote" depending on
// whether every item has a real price, but the document title cannot follow that
// (it is decided on the server, before the cart is known), so it stays neutral.
export const metadata: Metadata = {
  title: "Checkout",
  description: "Confirm your details to place an order or request a quote.",
  robots: { index: false, follow: false },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
