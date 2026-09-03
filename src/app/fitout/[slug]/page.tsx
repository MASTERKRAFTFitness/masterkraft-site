import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { recordNotFound } from "@/lib/not-found-log";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
import RevlFeature from "@/components/marketing/RevlFeature";
import FernwoodFeature from "@/components/marketing/FernwoodFeature";
import { fitouts, getFitout } from "@/lib/fitouts";

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
    title: `${f.name} Fitouts | Design, Supply & Install`,
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

  return (
    <>
      <PageHero
        eyebrow={`${f.name} Fitouts`}
        title={f.name}
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
          <Link href="/contact" className="btn btn-accent mt-10">
            Enquire About a {f.name} Fitout
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
        </aside>
      </section>

      {/* Boutique fitness: showcase the real REVL studio fit-out as proof. */}
      {f.slug === "boutique-fitness-fitout" && <RevlFeature />}

      {/* Commercial gym: showcase Fernwood custom-branded equipment as proof. */}
      {f.slug === "commercial-gym-fitout" && <FernwoodFeature />}
    </>
  );
}
