import Link from "next/link";
import Image from "next/image";
import { equipmentCategories, fitoutLinks, footerLinks } from "@/lib/nav";

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
              03 9044 9575
            </a>
            <Link href="/contact" className="block text-white/80 hover:text-accent transition-colors">
              Contact us
            </Link>
          </div>
          <div className="mt-5 flex gap-4 text-white/70">
            <a href="https://www.instagram.com/masterkraft.equipment/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-accent transition-colors">
              <InstagramIcon />
            </a>
            <a href="https://www.facebook.com/people/MasterKraft/100088228633638/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="hover:text-accent transition-colors">
              <FacebookIcon />
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
          </ul>
        </div>

        {/* Company / support */}
        <div>
          <h4 className="text-sm tracking-widest text-white/50">Company</h4>
          <ul className="mt-4 space-y-2.5">
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
          <p>
            © {new Date().getFullYear()} MasterKraft Pty Ltd. All rights reserved.
            {" · "}
            <span className="text-white/30">ABN 84 659 220 274</span>
          </p>
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

function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 9h3V6h-3c-1.7 0-3 1.3-3 3v2H9v3h2v7h3v-7h2.5l.5-3H14V9c0-.6.4-1 1-1z" />
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
