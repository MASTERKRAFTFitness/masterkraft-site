import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
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
    title: `${f.name} Fitouts`,
    description: f.blurb,
  };
}

export default async function FitoutTypePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const f = getFitout(slug);
  if (!f) notFound();

  const others = fitouts.filter((x) => x.slug !== f.slug);

  return (
    <>
      <PageHero eyebrow={`${f.name} Fitouts`} title={f.name} subtitle={f.blurb} image={f.image} />

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
    </>
  );
}
