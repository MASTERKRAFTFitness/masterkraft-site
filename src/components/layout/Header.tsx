"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { equipmentCategories, fitoutLinks } from "@/lib/nav";
import { useCart } from "@/components/cart/CartProvider";
import SearchBar from "@/components/layout/SearchBar";
import { portalLoginHref } from "@/lib/site";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

type MenuKey = "equipment" | "fitouts" | null;

const primaryNav = [
  { label: "Equipment", href: "/all-equipment", menu: "equipment" as const },
  { label: "Fitouts", href: "/fitout", menu: "fitouts" as const },
  { label: "Resources", href: "/resources" },
  { label: "Our Story", href: "/our-story" },
  { label: "Contact", href: "/contact" },
];

const NAV_MATCH: Record<string, string[]> = {
  "/all-equipment": ["/all-equipment", "/equipment/", "/product/", "/search"],
  "/fitout": ["/fitout"],
  "/resources": ["/resources"],
  "/our-story": ["/our-story"],
  "/contact": ["/contact"],
};

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => {
    return (NAV_MATCH[href] ?? [href]).some((m) =>
      m.endsWith("/") ? pathname.startsWith(m) : pathname === m || pathname.startsWith(m + "/") || pathname === m
    );
  };
}

export default function Header() {
  const isActive = useIsActive();
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSub, setMobileSub] = useState<MenuKey>(null);
  const [scrolled, setScrolled] = useState(false);
  const { count, subtotal, openDrawer } = useCart();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Solid (white) when scrolled, a menu is open, or mobile drawer is open.
  const solid = scrolled || openMenu !== null || mobileOpen;

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
        solid ? "bg-white text-ink border-b border-line" : "bg-transparent text-white"
      }`}
      onMouseLeave={() => setOpenMenu(null)}
    >
      <div className="container-mk flex items-center justify-between h-[76px] gap-4">
        {/* Brand (left) */}
        <Link href="/" aria-label="MasterKraft home" className="flex items-center gap-3 shrink-0">
          <Image
            src="/brand/logo-circle.svg"
            alt=""
            width={38}
            height={38}
            className={`h-9 w-9 transition ${solid ? "" : "brightness-0 invert"}`}
            priority
          />
          <Image
            src="/brand/logo.svg"
            alt="MASTERKRAFT"
            width={200}
            height={18}
            className={`hidden sm:block h-[18px] w-auto transition ${solid ? "" : "brightness-0 invert"}`}
            priority
          />
        </Link>

        {/* Inline nav (desktop) */}
        <nav className="hidden xl:flex items-center gap-5">
          {primaryNav.map((item) => (
            <div
              key={item.label}
              className="relative flex items-center"
              onMouseEnter={() => setOpenMenu(item.menu ?? null)}
            >
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`nav-link ${
                  isActive(item.href)
                    ? "text-accent-600"
                    : solid
                      ? "text-ash hover:text-ink"
                      : "text-white/80 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            </div>
          ))}
        </nav>

        {/* Actions (right) */}
        <div className="flex items-center gap-3 2xl:gap-4 shrink-0">
          <SearchBar solid={solid} />
          <button
            onClick={openDrawer}
            aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}
            className={`relative flex items-center gap-2 text-xs font-mono tracking-widest ${
              solid ? "text-ash hover:text-ink" : "text-white/80 hover:text-white"
            } transition-colors`}
          >
            <span className="relative">
              <CartIcon />
              {count > 0 && (
                <span className="absolute -top-2 -right-2.5 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-accent-600 text-white text-[10px] leading-none">
                  {count}
                </span>
              )}
            </span>
            <span className="hidden lg:inline xl:hidden">{aud.format(subtotal)}</span>
          </button>
          <Link href={portalLoginHref} className="btn btn-out hidden lg:inline-flex">
            Portal
          </Link>
          <Link href="/contact" className="btn btn-accent hidden md:inline-flex whitespace-nowrap">
            Fit-Out Solution&nbsp;<span aria-hidden>→</span>
          </Link>

          {/* Mobile toggle */}
          <button
            className="xl:hidden -mr-1 p-1"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <MenuIcon open={mobileOpen} />
          </button>
        </div>
      </div>

      {/* Mega menu panels */}
      {openMenu === "equipment" && (
        <MegaPanel columns={equipmentCategories} onNavigate={() => setOpenMenu(null)} />
      )}
      {openMenu === "fitouts" && (
        <MegaPanel columns={fitoutLinks} onNavigate={() => setOpenMenu(null)} />
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="xl:hidden bg-white text-ink border-t border-line max-h-[80vh] overflow-y-auto">
          <ul className="container-mk py-4 flex flex-col">
            {primaryNav.map((item) => {
              const sub =
                item.menu === "equipment"
                  ? equipmentCategories
                  : item.menu === "fitouts"
                    ? fitoutLinks
                    : null;
              const expanded = mobileSub === item.menu;
              return (
                <li key={item.label} className="border-b border-line/70">
                  <div className="flex items-center justify-between">
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className="block py-3 nav-link text-ink"
                    >
                      {item.label}
                    </Link>
                    {sub && (
                      <button
                        onClick={() => setMobileSub(expanded ? null : item.menu ?? null)}
                        aria-label={`Toggle ${item.label} submenu`}
                        aria-expanded={expanded}
                        className="p-3 text-ash text-lg leading-none"
                      >
                        {expanded ? "−" : "+"}
                      </button>
                    )}
                  </div>
                  {sub && expanded && (
                    <ul className="pb-3 pl-1">
                      {sub.map((s) => (
                        <li key={s.href}>
                          <Link
                            href={s.href}
                            onClick={() => setMobileOpen(false)}
                            className="block py-2 text-sm text-ash hover:text-accent-600 transition-colors"
                          >
                            {s.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
            <li className="grid grid-cols-2 gap-3 pt-4 mt-2">
              <Link href={portalLoginHref} onClick={() => setMobileOpen(false)} className="btn btn-out">
                Portal
              </Link>
              <Link href="/contact" onClick={() => setMobileOpen(false)} className="btn btn-accent">
                Fit-Out Solution →
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

function MegaPanel({
  columns,
  onNavigate,
}: {
  columns: { label: string; href: string; highlight?: boolean }[];
  onNavigate: () => void;
}) {
  return (
    <div className="hidden xl:block absolute inset-x-0 top-full bg-white text-ink border-t border-line shadow-lg">
      <div className="container-mk py-8">
        <ul className="flex flex-col gap-y-2.5 max-w-xs">
          {columns.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                onClick={onNavigate}
                className={`nav-link ${
                  c.highlight ? "text-accent-600 font-semibold hover:text-accent" : "text-ash hover:text-ink"
                }`}
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {open ? (
        <>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </>
      ) : (
        <>
          <path d="M3 6h18" />
          <path d="M3 12h18" />
          <path d="M3 18h18" />
        </>
      )}
    </svg>
  );
}
