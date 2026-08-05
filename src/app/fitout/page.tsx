import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
import { fitouts } from "@/lib/fitouts";

export const metadata: Metadata = {
  title: "Gym Fitouts | Design, Supply & Install",
  description:
    "Transform your training space. Made by fitness professionals for fitness professionals - boutique, commercial, elite sports, home, PT studio and education fitouts.",
  alternates: { canonical: "/fitout" },
};

const valueProps = [
  ["Quality", "Premium design and functionality across the full range."],
  ["Endurance", "Built to survive the most demanding commercial environments."],
  ["Bespoke", "In-house engineers customise equipment and branding to your space."],
  ["Experience", "Decades of importing, exporting and fitting out gyms globally."],
  ["Competitive Advantage", "Strong factory relationships that maximise your value."],
  ["Full Service", "Design, supply, logistics, QC and warranty - end to end."],
  ["Tailored Pricing", "Pricing structured to your project and volume."],
  ["Logistics", "Streamlined global delivery, direct to your door."],
  ["Values", "Fairness, integrity and accountability in every partnership."],
];

export default function FitoutLanding() {
  return (
    <>
      <PageHero
        eyebrow="Fitouts"
        title="Transform Your Training Space"
        subtitle="Made by fitness professionals for fitness professionals, we help transform any available space into the most powerful, functional fitness zone imaginable."
        image="/home/fitouts.jpg"
      />

      {/* Fitout types */}
      <section className="container-mk py-20">
        <div className="flex flex-col items-center text-center mb-12">
          <Eyebrow className="mb-3">Markets We Serve</Eyebrow>
          <h2 className="text-3xl lg:text-4xl font-bold">Complete Fitout Solutions</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {fitouts.map((f) => (
            <Link
              key={f.slug}
              href={`/fitout/${f.slug}`}
              className="group relative aspect-[4/3] overflow-hidden bg-carbon"
            >
              <Image
                src={f.image}
                alt={f.name}
                fill
                className="object-cover opacity-60 transition-all duration-500 group-hover:opacity-80 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <h3 className="text-white text-xl font-bold group-hover:text-accent transition-colors">
                  {f.name}
                </h3>
                <p className="mt-1.5 text-white/70 text-sm">{f.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Why MasterKraft */}
      <section className="bg-smoke">
        <div className="container-mk py-20">
          <div className="flex flex-col items-center text-center mb-12">
            <Eyebrow className="mb-3">Why MasterKraft</Eyebrow>
            <h2 className="text-3xl lg:text-4xl font-bold">The MasterKraft Advantage</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line">
            {valueProps.map(([title, body]) => (
              <div key={title} className="bg-smoke p-8">
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="mt-2 text-ash text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink text-white">
        <div className="container-mk py-20 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold">Need help fitting out your space?</h2>
          <p className="mt-4 text-white/70 max-w-2xl mx-auto">
            If you require premium-quality, high-performance gym and fitness equipment, we
            invite you to get in touch today.
          </p>
          <Link href="/contact" className="btn btn-accent mt-8">
            Get in Touch
          </Link>
        </div>
      </section>
    </>
  );
}
