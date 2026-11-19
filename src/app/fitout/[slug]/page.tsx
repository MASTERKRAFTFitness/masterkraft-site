import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { recordNotFound } from "@/lib/not-found-log";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
import RevlFeature from "@/components/marketing/RevlFeature";
import FernwoodPakenhamCaseStudy from "@/components/marketing/FernwoodPakenhamCaseStudy";
import IndieIronCallout from "@/components/indie-iron/IndieIronCallout";
import { fitouts, getFitout } from "@/lib/fitouts";
import { locations } from "@/lib/locations";
import { withQualifier } from "@/lib/page-title";
import JsonLd from "@/components/seo/JsonLd";
import { PUBLISHER } from "@/components/seo/PageSchema";
import { SITE_URL } from "@/lib/site";

// Fit-out pages that carry the Indie Iron callout. Not the franchise page: the
// buying group is for independents.
const INDIE_IRON_FITOUTS = new Set(["boutique-fitness-fitout", "independent-gym-fitout"]);

export function generateStaticParams() {
  return fitouts.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const f = getFitout(slug);
  if (!f) return { title: "Fitouts" };
  return {
    // The qualifier goes whole or not at all — "Elite Sports Clubs" and
    // "Schools & University" run past what a search result shows with it.
    // See lib/page-title.
    title: withQualifier(`${f.name} Fitouts`, "Design, Supply & Install"),
    description: f.blurb,
    alternates: { canonical: `/fitout/${f.slug}` },
  };
}

export default async function FitoutTypePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const f = getFitout(slug);
  if (!f) {
    // A dead /fitout/ URL is the likeliest kind to be an old link worth
    // redirecting, and the slug is right here — no request header needed.
    // See lib/not-found-log.ts for why the path is passed rather than read.
    after(() => recordNotFound(`/fitout/${encodeURIComponent(slug)}`));
    notFound();
  }

  const others = fitouts.filter((x) => x.slug !== f.slug);

  // The service this page sells, as structured data — the city pages have had
  // the same since launch. The 12 Nov page audit scored the commercial page
  // down for having none. Area served is the homepage Organization's own claim.
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Gym fitout",
    name: `${f.name} Fitouts`,
    description: f.intro,
    url: `${SITE_URL}/fitout/${f.slug}`,
    provider: PUBLISHER,
    areaServed: [
      { "@type": "Country", name: "Australia" },
      { "@type": "Place", name: "Asia-Pacific" },
    ],
  };

  return (
    <>
      <JsonLd data={serviceSchema} />
      {/* The H1 carries "Fitouts": "Commercial Gym" alone missed the phrase
          people search, and the page audit flagged the keyword absent from
          the H1. The eyebrow above it says what section this is instead. */}
      <PageHero
        eyebrow="Gym Fitouts"
        title={`${f.name} Fitouts`}
        subtitle={f.blurb}
        image={f.image}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Fitouts", href: "/fitout" },
          { name: f.name, href: `/fitout/${f.slug}` },
        ]}
      />

      <section className="container-mk py-20 grid lg:grid-cols-3 gap-14">
        <div className="lg:col-span-2">
          <Eyebrow className="mb-4">Overview</Eyebrow>
          <p className="text-xl text-ink leading-relaxed">{f.intro}</p>
          <ul className="mt-8 space-y-4">
            {f.points.map((p) => (
              <li key={p} className="flex gap-3">
                <span className="mt-1.5 h-2.5 w-2.5 bg-accent shrink-0" aria-hidden />
                <span className="text-ash leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>
          <Link href="/fitout-solution" className="btn btn-accent mt-10">
            Enquire About {/^[AEIOU]/.test(f.name) ? "an" : "a"} {f.name} Fitout
          </Link>
        </div>

        {/* Other fitout types */}
        <aside>
          <h3 className="text-sm tracking-widest text-ash mb-4">Other Fitouts</h3>
          <ul className="space-y-2">
            {others.map((o) => (
              <li key={o.slug}>
                <Link
                  href={`/fitout/${o.slug}`}
                  className="flex items-center justify-between border-b border-line py-3 font-display uppercase tracking-wide text-sm hover:text-accent-600 transition-colors"
                >
                  {o.name}
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>

          {/* The city pages, by name, from every fitout type: see the comment
              on the matching block in app/gym-fitouts/[city]/page.tsx. */}
          <h3 className="text-sm tracking-widest text-ash mt-10 mb-4">Where We Deliver</h3>
          <ul className="grid grid-cols-2 gap-x-6">
            {locations
              .filter((l) => !l.international)
              .map((l) => (
                <li key={l.slug}>
                  <Link
                    href={`/gym-fitouts/${l.slug}`}
                    className="flex items-center justify-between border-b border-line py-3 font-display uppercase tracking-wide text-sm hover:text-accent-600 transition-colors"
                  >
                    {l.city}
                    <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
          </ul>
        </aside>
      </section>

      {/* Boutique fitness: showcase the real REVL studio fitout as proof. */}
      {(f.slug === "boutique-fitness-fitout" || f.slug === "commercial-gym-fitout") && <RevlFeature />}

      {/* Franchise gyms: a real club, Fernwood Pakenham, as proof. Not on the
          independent page, which this used to share: Fernwood is a franchise.
          The commercial page carries both, since a commercial fitout is what
          each of them is; the 12 Nov page audit found it had no proof at all. */}
      {(f.slug === "franchise-gym-fitout" || f.slug === "commercial-gym-fitout") && <FernwoodPakenhamCaseStudy />}

      {/* The buying group, on the pages independent gym owners land on. */}
      {INDIE_IRON_FITOUTS.has(f.slug) && <IndieIronCallout />}
    </>
  );
}
