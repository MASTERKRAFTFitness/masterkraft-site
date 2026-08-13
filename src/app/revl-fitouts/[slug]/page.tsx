import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
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

      {s.gallery.length > 0 && (
        <section className="bg-smoke border-t border-line">
          <div className="container-mk py-20">
            <Eyebrow className="mb-10">Inside {s.name}</Eyebrow>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {s.gallery.map((src, i) => (
                <div
                  key={src}
                  className="relative aspect-[4/3] overflow-hidden bg-carbon"
                >
                  <Image
                    src={src}
                    alt={`${s.name} fit-out by MasterKraft`}
                    fill
                    className="object-cover transition-transform duration-500 hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 33vw"
                    priority={i === 0}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
