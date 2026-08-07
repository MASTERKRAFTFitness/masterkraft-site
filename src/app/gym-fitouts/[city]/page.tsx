import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
import JsonLd from "@/components/seo/JsonLd";
import { SITE_URL } from "@/lib/site";
import { locations, getLocation } from "@/lib/locations";

export function generateStaticParams() {
  return locations.map((l) => ({ city: l.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const loc = getLocation(city);
  if (!loc) return { title: "Gym Fitouts" };
  return {
    title: `Gym Fitouts ${loc.city} | Design, Supply & Install`,
    description: loc.meta,
    alternates: { canonical: `/gym-fitouts/${loc.slug}` },
  };
}

const capabilities = [
  "Rigs, racks and platforms",
  "Strength and weightlifting",
  "Cardio and conditioning",
  "Functional training zones",
  "Storage and gym flooring",
  "Custom-branded equipment",
];

export default async function LocationPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const loc = getLocation(city);
  if (!loc) notFound();

  const areaName = loc.state ? `${loc.city}, ${loc.state}` : loc.city;
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Gym fit-out",
    name: `Gym Fitouts ${loc.city}`,
    description: loc.meta,
    areaServed: { "@type": "Place", name: areaName },
    provider: { "@type": "Organization", name: "MasterKraft", url: SITE_URL },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: loc.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <JsonLd data={serviceSchema} />
      <JsonLd data={faqSchema} />

      <PageHero
        eyebrow="Gym Fitouts"
        title={`Gym Fitouts ${loc.city}`}
        subtitle={
          loc.state
            ? `Design, supply and install across ${loc.city} and ${loc.state}.`
            : `Design, supply and deliver complete fit-outs across ${loc.city}.`
        }
        image="/revl/full-studio.jpg"
        imagePosition="center 45%"
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Fitouts", href: "/fitout" },
          { name: loc.city, href: `/gym-fitouts/${loc.slug}` },
        ]}
      />

      <section className="container-mk py-16 lg:py-20 grid lg:grid-cols-[1.5fr_1fr] gap-14">
        <div>
          <Eyebrow className="mb-5">{loc.city} Fit-Outs</Eyebrow>
          <div className="space-y-5 text-lg leading-relaxed">
            {loc.intro.map((p, i) => (
              <p key={i} className={i === 0 ? "text-ink" : "text-ash"}>
                {p}
              </p>
            ))}
          </div>

          <h2 className="mt-12 text-sm font-mono tracking-widest uppercase text-accent-600">
            What we deliver
          </h2>
          <ul className="mt-5 grid sm:grid-cols-2 gap-x-8 gap-y-3">
            {capabilities.map((c) => (
              <li key={c} className="flex gap-3 text-ash leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-accent" aria-hidden />
                {c}
              </li>
            ))}
          </ul>

          {loc.project && (
            <div className="mt-12 border border-line p-6 sm:p-7">
              <p className="font-mono text-[11px] tracking-widest uppercase text-accent-600">
                Recent project near you
              </p>
              <h3 className="mt-2 text-xl font-bold">{loc.project.name}</h3>
              <p className="mt-2 text-ash leading-relaxed">{loc.project.blurb}</p>
              <Link
                href={loc.project.href}
                className="mt-4 inline-flex items-center gap-2 font-mono text-xs tracking-widest uppercase text-accent-600 hover:text-accent"
              >
                View the fit-out <span aria-hidden>→</span>
              </Link>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-28 self-start space-y-8">
          <div className="bg-cloud border border-line p-6">
            <h2 className="font-mono text-xs tracking-widest uppercase text-accent-600">
              Delivery to {loc.city}
            </h2>
            <p className="mt-3 text-ash leading-relaxed">{loc.delivery}</p>
          </div>
          <div>
            <Link href="/contact" className="btn btn-accent w-full">
              Request a {loc.city} Fit-Out <span aria-hidden>→</span>
            </Link>
            <Link href="/fitout" className="btn btn-out !text-ink w-full mt-3">
              Explore fit-out types
            </Link>
          </div>
        </aside>
      </section>

      {/* FAQ */}
      <section className="border-t border-line">
        <div className="container-mk py-16 max-w-3xl">
          <Eyebrow className="mb-8">{loc.city} FAQs</Eyebrow>
          <div className="divide-y divide-line">
            {loc.faqs.map((f) => (
              <div key={f.q} className="py-6 first:pt-0">
                <h3 className="text-lg font-bold">{f.q}</h3>
                <p className="mt-2 text-ash leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
