import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Hero from "@/components/home/Hero";
import FeatureBlock from "@/components/home/FeatureBlock";
import Marquee from "@/components/marketing/Marquee";
import Eyebrow from "@/components/ui/Eyebrow";
import UspGrid from "@/components/marketing/UspGrid";
import StatsBand from "@/components/marketing/StatsBand";
import NewsletterForm from "@/components/marketing/NewsletterForm";
import JsonLd from "@/components/seo/JsonLd";
import { SITE_URL } from "@/lib/site";
import { shopByCategory } from "@/lib/nav";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "MasterKraft",
  legalName: "MasterKraft Pty Ltd",
  alternateName: "MasterKraft Fitness",
  url: SITE_URL,
  logo: `${SITE_URL}/brand/logo-circle.svg`,
  image: `${SITE_URL}/brand/logo-circle.svg`,
  slogan: "Engineered for Fitness",
  description:
    "MasterKraft designs, engineers and supplies commercial and home gym equipment and delivers complete custom gym fit-outs across Australia and the Asia-Pacific.",
  areaServed: [
    { "@type": "Country", name: "Australia" },
    { "@type": "Place", name: "Asia-Pacific" },
  ],
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+61-3-9044-9575",
    contactType: "sales",
    areaServed: "AU",
    availableLanguage: "English",
  },
  sameAs: [
    "https://www.instagram.com/masterkraft.equipment/",
    "https://www.facebook.com/people/MasterKraft/100088228633638/",
    "https://www.linkedin.com/company/masterkraft-pty-ltd/",
  ],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "MASTERKRAFT",
  url: SITE_URL,
};

const categoryImages: Record<string, string> = {
  "Body Weight": "/category/body-weight.jpg",
  Cardio: "/category/cardio.jpg",
  Flooring: "/category/flooring.jpg",
  "Mixed Implements": "/category/mixed-implements.jpg",
  "Rigs & Racks": "/category/rigs-racks.jpg",
  "Equipment Storage": "/category/equipment-storage.jpg",
  Strength: "/category/strength.jpg",
  Weightlifting: "/category/weightlifting.jpg",
};

export default function Home() {
  return (
    <>
      <JsonLd data={orgSchema} />
      <JsonLd data={websiteSchema} />
      <Hero />

      <Marquee />

      <FeatureBlock
        eyebrow="Shop Equipment"
        title="Built to Perform, Priced to Move"
        body="Explore the full MasterKraft range - strength, weightlifting, cardio, rigs and more. Engineered and manufactured to commercial-grade standards for gyms, studios and serious home setups."
        cta="Shop Now"
        href="/all-equipment"
        image="/home/shop-equipment.jpg"
      />

      <FeatureBlock
        eyebrow="Fitouts"
        title="Complete Fitout Solutions"
        body="From boutique studios to full commercial gyms and elite sports clubs, our team designs and delivers end-to-end fitouts tailored to your space, your members and your budget."
        cta="Read More"
        href="/fitout"
        image="/home/fitouts.jpg"
        reverse
      />

      <FeatureBlock
        eyebrow="Wholesale"
        title="Become a Distributor"
        body="Partner with MasterKraft and supply premium fitness equipment at chain-level pricing. Access our wholesale portal, dedicated account support and flexible logistics."
        cta="Find Out More"
        href="/distributor"
        image="/home/distributor.jpg"
      />

      {/* Proof stats */}
      <StatsBand />

      {/* USP framework */}
      <UspGrid />

      <Marquee dark />

      {/* Shop by Category */}
      <section className="container-mk py-20">
        <div className="flex flex-col items-center text-center mb-12">
          <Eyebrow className="mb-3">Explore the Range</Eyebrow>
          <h2 className="text-3xl lg:text-4xl font-bold">Shop by Category</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {shopByCategory.map((cat) => (
            <Link
              key={cat.href}
              href={cat.href}
              className="group relative aspect-square overflow-hidden bg-carbon"
            >
              <Image
                src={categoryImages[cat.label]}
                alt={cat.label}
                fill
                className="object-cover opacity-70 transition-all duration-500 group-hover:opacity-90 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <h3 className="text-white text-lg font-semibold group-hover:text-accent transition-colors">
                  {cat.label}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* REVL partnership */}
      <section className="bg-smoke">
        <div className="container-mk py-20 grid md:grid-cols-2 gap-12 items-center">
          <div className="relative aspect-[4/3] bg-white">
            <Image
              src="/home/revl.png"
              alt="REVL Training × MasterKraft"
              fill
              className="object-contain p-8"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          <div>
            <Eyebrow className="mb-4">Partnership</Eyebrow>
            <h2 className="text-3xl lg:text-4xl font-bold">Powered by MasterKraft</h2>
            <p className="mt-5 text-ash leading-relaxed">
              We proudly supply and fit out REVL Training studios across Australia -
              a testament to equipment trusted by fast-scaling boutique brands. When
              performance and consistency matter, operators choose MasterKraft.
            </p>
            <Link href="/revl-fitouts" className="btn btn-dark mt-8">
              View REVL Fitouts
            </Link>
          </div>
        </div>
      </section>

      {/* Company story */}
      <section className="relative bg-carbon text-white overflow-hidden">
        <div className="absolute inset-0 mk-glow" aria-hidden />
        <div className="relative container-mk py-24 flex flex-col items-center text-center max-w-3xl mx-auto">
          <Eyebrow tone="dark" className="mb-4">The Power of Passion</Eyebrow>
          <h2 className="text-3xl lg:text-5xl font-bold leading-tight">
            Made by fitness professionals, for fitness professionals
          </h2>
          <p className="mt-6 text-white/70 leading-relaxed text-lg">
            MasterKraft was built on a simple belief: that serious training deserves
            serious equipment - engineered without compromise and offered with honest
            affordability. Every rig, plate and rack we make is designed to endure.
          </p>
          <Link href="/our-story" className="btn btn-accent mt-10">
            Our Story
          </Link>
        </div>
      </section>

      {/* Newsletter */}
      <section className="bg-ink text-white border-t border-white/10">
        <div className="container-mk py-16 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <h3 className="text-2xl font-bold">Join the MasterKraft list</h3>
            <p className="mt-2 text-white/60">
              New releases, clearance drops and fitout inspiration - straight to your inbox.
            </p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}
