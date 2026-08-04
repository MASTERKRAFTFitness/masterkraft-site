import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
import { revlSites } from "@/lib/revl";

export const metadata: Metadata = {
  title: "REVL Fitouts",
  description:
    "MasterKraft proudly supplies and fits out REVL Training studios across Australia - premium boutique performance gyms.",
};

export default function RevlLanding() {
  return (
    <>
      <PageHero
        eyebrow="Partnership"
        title="REVL Training Fitouts"
        subtitle="Founded in 2020, REVL Training revolutionises group fitness through performance-based training. MasterKraft is proud to supply and fit out REVL studios across Australia."
        image="/category/rigs-racks.jpg"
      />

      <section className="container-mk py-20">
        <Eyebrow className="mb-10">Featured Studios</Eyebrow>
        <div className="grid md:grid-cols-2 gap-6">
          {revlSites.map((s) => (
            <Link key={s.slug} href={`/revl-fitouts/${s.slug}`} className="group">
              <div className="relative aspect-[3/2] overflow-hidden bg-carbon">
                <Image
                  src={s.image}
                  alt={s.name}
                  fill
                  className="object-cover opacity-70 transition-all duration-500 group-hover:opacity-90 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
              <div className="mt-4">
                <p className="font-mono text-xs tracking-widest text-accent uppercase">{s.location}</p>
                <h3 className="mt-1 text-xl font-bold group-hover:text-accent-600 transition-colors">
                  {s.name}
                </h3>
                <p className="mt-1 text-ash text-sm">{s.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
