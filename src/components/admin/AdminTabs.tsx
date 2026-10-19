"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// One tab row across every admin page, so staff move between the desk and its
// reports without hunting for a text link. `full` is identityMode() ===
// "supabase", decided on the server: the pages behind it read Supabase and say
// so themselves in shared-password mode, so there is no point offering them.
const TABS = [
  { href: "/admin", label: "Support desk", full: false },
  { href: "/admin/analytics", label: "Web analytics", full: false },
  { href: "/admin/checkouts", label: "Checkouts", full: true },
  { href: "/admin/activity", label: "Activity", full: true },
  { href: "/admin/dead-links", label: "Dead links", full: true },
  { href: "/admin/freight", label: "Freight", full: true },
];

export default function AdminTabs({ full }: { full: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="mb-6 -mx-4 overflow-x-auto px-4 border-b border-line">
      <ul className="flex gap-1 whitespace-nowrap text-xs uppercase tracking-wide">
        {TABS.filter((t) => full || !t.full).map((t) => {
          const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-block border-b-2 px-3 py-2 transition-colors ${
                  active ? "border-accent-600 text-ink" : "border-transparent text-ash hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
