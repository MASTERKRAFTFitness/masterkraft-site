import Image from "next/image";
import Link from "next/link";
import Eyebrow from "@/components/ui/Eyebrow";
import JsonLd from "@/components/seo/JsonLd";
import { SITE_URL } from "@/lib/site";

export type Crumb = { name: string; href: string };

export default function PageHero({
  eyebrow,
  title,
  subtitle,
  image,
  imagePosition = "center 28%",
  breadcrumbs,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  image?: string;
  // Focal point for the banner crop. Defaults to an upward bias so people's
  // heads/faces (usually near the top of these shots) stay cropped IN rather
  // than sliced off by the short, wide banner band.
  imagePosition?: string;
  breadcrumbs?: Crumb[];
}) {
  const hasCrumbs = breadcrumbs && breadcrumbs.length > 0;
  return (
    <section className="relative bg-carbon text-white overflow-hidden">
      {image ? (
        <>
          <Image
            src={image}
            alt=""
            fill
            className="object-cover opacity-40"
            style={{ objectPosition: imagePosition }}
            sizes="100vw"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-carbon via-carbon/70 to-carbon/30" />
        </>
      ) : (
        <div className="absolute inset-0 mk-glow" aria-hidden />
      )}

      {hasCrumbs && (
        <>
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: breadcrumbs!.map((c, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: c.name,
                item: `${SITE_URL}${c.href}`,
              })),
            }}
          />
          <nav aria-label="Breadcrumb" className="relative">
            <ol className="container-mk pt-28 pb-3 flex flex-wrap items-center gap-2 font-mono text-xs tracking-widest uppercase text-white/55">
              {breadcrumbs!.map((c, i) => (
                <li key={c.href} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden>/</span>}
                  {i < breadcrumbs!.length - 1 ? (
                    <Link href={c.href} className="hover:text-accent transition-colors">
                      {c.name}
                    </Link>
                  ) : (
                    <span className="text-white/85">{c.name}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </>
      )}

      <div
        className={`relative container-mk pb-20 lg:pb-28 ${
          hasCrumbs ? "pt-4 lg:pt-6" : "pt-32 lg:pt-40"
        }`}
      >
        {eyebrow && (
          <Eyebrow tone="dark" className="mb-5">
            {eyebrow}
          </Eyebrow>
        )}
        <h1 className="text-4xl lg:text-6xl font-bold max-w-3xl leading-[1.05]">{title}</h1>
        {subtitle && (
          <p className="mt-6 text-white/70 text-lg max-w-2xl leading-relaxed">{subtitle}</p>
        )}
      </div>
    </section>
  );
}
