import type { Metadata } from "next";
import { Inter, Oswald, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { CartProvider } from "@/components/cart/CartProvider";
import CartDrawer from "@/components/cart/CartDrawer";
import CookieConsent from "@/components/layout/CookieConsent";
import NavProgress from "@/components/layout/NavProgress";
import { SITE_URL, ALLOW_INDEX } from "@/lib/site";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MASTERKRAFT | Shop Home Gym & Commercial Fitness Equipment",
    template: "%s | MASTERKRAFT",
  },
  description:
    "Engineered for Fitness. High-performance commercial and home gym equipment, custom fitouts and wholesale supply, designed and engineered to dominate.",
  openGraph: {
    siteName: "MASTERKRAFT",
    type: "website",
    locale: "en_AU",
  },
  twitter: { card: "summary_large_image" },
  // Off until launch, so the preview + staging domains are never indexed.
  robots: ALLOW_INDEX ? undefined : { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${oswald.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-ink">
        <CartProvider>
          <NavProgress />
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:top-3 focus:left-3 focus:bg-ink focus:text-white focus:px-4 focus:py-2 focus:font-mono focus:text-sm"
          >
            Skip to content
          </a>
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
          <CartDrawer />
          <CookieConsent />
        </CartProvider>
      </body>
    </html>
  );
}
