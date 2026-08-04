import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import { portalLoginHref } from "@/lib/site";

export const metadata: Metadata = {
  title: "Wholesale Store",
  description: "Wholesale ordering for MasterKraft trade partners.",
};

export default function WholesaleStorePage() {
  return (
    <>
      <PageHero
        eyebrow="Wholesale"
        title="Wholesale Store"
        subtitle="Trade pricing and self-serve ordering for approved partners."
      />
      <section className="container-mk py-20 max-w-xl text-center">
        <p className="text-ash text-lg">
          The wholesale store is available to approved trade partners through the portal.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href={portalLoginHref} className="btn btn-accent">
            Portal Login
          </Link>
          <Link href="/distributor" className="btn btn-out !text-ink">
            Become a Distributor
          </Link>
        </div>
      </section>
    </>
  );
}
