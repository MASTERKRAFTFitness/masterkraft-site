import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import { portalLoginHref } from "@/lib/site";

export const metadata: Metadata = {
  title: "Partner Portal",
  description: "One custom-branded portal - ordering, tracking and support for every site.",
};

const links = [
  { label: "Our Process", href: "/portal/our-process" },
  { label: "Process Overview", href: "/portal/process-overview" },
  { label: "Delivery Information", href: "/portal/delivery-information" },
  { label: "Forms", href: "/portal/forms" },
  { label: "Finance & Legal", href: "/portal/finance-legal" },
];

export default function PortalPage() {
  return (
    <>
      <PageHero
        eyebrow="Partner Portal"
        title="One Portal, Total Transparency"
        subtitle="Ordering, tracking and support for every site in your group - in one custom-branded place."
      />
      <section className="container-mk py-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-center justify-between border border-line px-6 py-5 font-display uppercase tracking-wide hover:border-accent hover:text-accent-600 transition-colors"
            >
              {l.label}
              <span aria-hidden>→</span>
            </Link>
          ))}
        </div>
        <p className="mt-10 text-ash text-sm">
          Partners can{" "}
          <Link href={portalLoginHref} className="underline decoration-accent-600 underline-offset-2">
            sign in
          </Link>{" "}
          for account-specific ordering and statements.
        </p>
      </section>
    </>
  );
}
