import Link from "next/link";
import Image from "next/image";
import { equipmentCategories, fitoutLinks, footerLinks } from "@/lib/nav";
import { blogEnabled, BLOG_PREFIX } from "@/lib/opinly-content";

export default function Footer() {
  return (
    <footer className="bg-carbon text-white">
      <div className="container-mk py-16 grid gap-12 md:grid-cols-4">
        {/* Brand column */}
        <div className="md:col-span-1">
          <Image
            src="/brand/logo.svg"
            alt="MASTERKRAFT"
            width={220}
            height={20}
            className="h-5 w-auto brightness-0 invert"
          />
          <p className="mt-5 text-sm text-white/60 leading-relaxed">
            Engineered for Fitness. High-performance commercial and home gym
            equipment, custom fitouts and wholesale supply.
          </p>
          <div className="mt-6 space-y-1.5 text-sm">
            <a href="tel:+61390449575" className="block text-white/80 hover:text-accent transition-colors">
              +61 3 9044 9575
            </a>
            <Link href="/contact" className="block text-white/80 hover:text-accent transition-colors">
              Contact us
            </Link>
          </div>
          <div className="mt-5 flex gap-4 text-white/70">
            <a href="https://www.instagram.com/masterkraft.equipment/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-accent transition-colors">
              <InstagramIcon />
            </a>
            <a href="https://www.linkedin.com/company/masterkraft-pty-ltd/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="hover:text-accent transition-colors">
              <LinkedInIcon />
            </a>
          </div>
        </div>

        {/* Equipment */}
        <div>
          <h4 className="text-sm tracking-widest text-white/50">Equipment</h4>
          <ul className="mt-4 space-y-2.5">
            {equipmentCategories.slice(1, 9).map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-white/80 hover:text-accent transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Fitouts */}
        <div>
          <h4 className="text-sm tracking-widest text-white/50">Fitouts</h4>
          <ul className="mt-4 space-y-2.5">
            {fitoutLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-white/80 hover:text-accent transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
            {/* The brief wizard, named the same as the header button so the two
                read as one thing. NOT in `fitoutLinks` — that list is shared with
                the header's mega panel, which already has the button two
                centimetres away. */}
            <li>
              <Link
                href="/contact#brief"
                className="text-sm text-white/80 hover:text-accent transition-colors"
              >
                Fitout Solution
              </Link>
            </li>
          </ul>
        </div>

        {/* Company / support */}
        <div>
          <h4 className="text-sm tracking-widest text-white/50">Company</h4>
          <ul className="mt-4 space-y-2.5">
            {/* THE JOURNAL IS CONDITIONAL, and not in `footerLinks`, because
                unlike every other link in that list it can be unbuilt. /blog is
                served by Opinly and 404s until OPINLY_CDN_NAMESPACE is set in
                next.config.ts — so a static entry would put a dead link in the
                footer of every page on the site, which is both a bad visit and
                something Search Console reports as a crawl error. Gated on the
                same check the route itself uses, so the link exists exactly when
                the page does. */}
            {blogEnabled() && (
              <li>
                <Link
                  href={BLOG_PREFIX}
                  className="text-sm text-white/80 hover:text-accent transition-colors"
                >
                  Journal
                </Link>
              </li>
            )}
            {footerLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-white/80 hover:text-accent transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-mk py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/50">
          <p>© {new Date().getFullYear()} MasterKraft Pty Ltd. All rights reserved.</p>
          <p className="font-display tracking-widest text-white/70">Engineered for Fitness</p>
        </div>
      </div>
    </footer>
  );
}

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.98 3.5C4.98 4.881 3.87 6 2.5 6S.02 4.881.02 3.5C.02 2.12 1.13 1 2.5 1s2.48 1.12 2.48 2.5zM.24 8h4.52V24H.24V8zm7.55 0h4.33v2.19h.06c.6-1.14 2.08-2.34 4.28-2.34 4.58 0 5.42 3.01 5.42 6.93V24h-4.52v-7.03c0-1.68-.03-3.83-2.34-3.83-2.34 0-2.7 1.83-2.7 3.71V24H7.79V8z" />
    </svg>
  );
}
