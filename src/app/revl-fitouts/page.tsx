import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
import { revlSites, revlNetwork, revlGallery } from "@/lib/revl";

export const metadata: Metadata = {
  title: "REVL Fitouts",
  description:
    "MasterKraft is the exclusive global equipment supplier to REVL Training, fitting out studios across Australia, Singapore, Malaysia, Vietnam, Taiwan and beyond - delivered complete in a single container.",
  alternates: { canonical: "/revl-fitouts" },
};

export default function RevlLanding() {
  return (
    <>
      <PageHero
        eyebrow="Partnership"
        title="REVL Training Fitouts"
        subtitle="Founded in 2020, REVL Training revolutionises group fitness through performance-based training. As REVL's exclusive global equipment supplier, MasterKraft fits out every REVL studio worldwide, delivered complete in a single container."
        image="/revl/full-studio.jpg"
        imagePosition="center 40%"
      />

      {/* Photo gallery */}
      <section className="container-mk pt-16 pb-4">
        <Eyebrow className="mb-8">Inside REVL</Eyebrow>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
          {revlGallery.map((g, i) => (
            <div
              key={g.src}
              className={`relative overflow-hidden bg-carbon ${
                i === 0 ? "col-span-2 aspect-square lg:row-span-2 lg:aspect-auto" : "aspect-square"
              }`}
            >
              <Image
                src={g.src}
                alt={g.alt}
                fill
                className="object-cover transition-transform duration-500 hover:scale-105"
                sizes="(max-width: 1024px) 50vw, 25vw"
              />
            </div>
          ))}
        </div>
      </section>

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

      {/* Global network */}
      <section className="bg-smoke border-t border-line">
        <div className="container-mk py-20">
          <Eyebrow className="mb-4">Global Network</Eyebrow>
          <h2 className="text-3xl lg:text-4xl font-bold max-w-2xl">
            Every REVL studio, fitted out by MasterKraft
          </h2>
          <p className="mt-4 text-ash max-w-2xl leading-relaxed">
            As REVL Training&apos;s exclusive global equipment supplier since 2023, MasterKraft has
            fitted out its studios across eight markets worldwide - each delivered to the same spec,
            the same quality and the same branding.
          </p>

          <div className="mt-12 divide-y divide-line border-t border-line">
            {revlNetwork.map((m) => (
              <div key={m.country} className="grid md:grid-cols-4 gap-2 md:gap-6 py-6">
                <div className="md:col-span-1">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <span aria-hidden>{m.flag}</span> {m.country}
                  </h3>
                  {m.studios.length > 0 && (
                    <p className="mt-1 font-mono text-xs tracking-widest text-ash uppercase">
                      {m.studios.length} studio{m.studios.length === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
                <div className="md:col-span-3">
                  {m.studios.length > 0 ? (
                    <p className="text-ash text-sm leading-relaxed">{m.studios.join(" · ")}</p>
                  ) : m.comingSoon ? (
                    <span className="inline-block font-mono text-[10px] tracking-widest uppercase text-accent-600 border border-accent-600/40 px-2.5 py-1">
                      Coming soon
                    </span>
                  ) : (
                    <p className="text-ash text-sm">Studios operating</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
