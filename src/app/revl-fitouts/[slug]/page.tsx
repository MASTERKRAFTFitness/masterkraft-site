import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHero from "@/components/marketing/PageHero";
import { revlSites, getRevlSite } from "@/lib/revl";

export function generateStaticParams() {
  return revlSites.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = getRevlSite(slug);
  if (!s) return { title: "REVL Fitouts" };
  return {
    title: `${s.name} | REVL Fit-Out`,
    description: s.blurb,
    alternates: { canonical: `/revl-fitouts/${s.slug}` },
  };
}

export default async function RevlSitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = getRevlSite(slug);
  if (!s) notFound();

  return (
    <>
      <PageHero
        eyebrow={s.location}
        title={s.name}
        subtitle={s.blurb}
        image={s.image}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "REVL Fitouts", href: "/revl-fitouts" },
          { name: s.name, href: `/revl-fitouts/${s.slug}` },
        ]}
      />

      <section className="container-mk py-20 max-w-3xl">
        <div className="space-y-5 text-lg text-ash leading-relaxed">
          {s.body.map((p, i) => (
            <p key={i} className={i === 0 ? "text-ink" : ""}>
              {p}
            </p>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/revl-fitouts" className="btn btn-out !text-ink">
            ← All REVL Fitouts
          </Link>
          <Link href="/contact" className="btn btn-accent">
            Start Your Fit-Out
          </Link>
        </div>
      </section>
    </>
  );
}
