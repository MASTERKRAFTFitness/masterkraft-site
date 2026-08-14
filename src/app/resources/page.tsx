import type { Metadata } from "next";
import Image from "next/image";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
import docs from "@/lib/resource-docs.json";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Product manuals, installation guides and technical documents for MasterKraft equipment.",
};

type Doc = { name: string; sub: string; thumb: string | null; download: string | null; external?: boolean };

export default function ResourcesPage() {
  const items = docs as Doc[];
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Guides & Product Manuals"
        subtitle="Need help to assemble your equipment or get the most out of your products? Find installation guides and product manuals here."
      />

      <section className="container-mk py-16">
        <Eyebrow className="mb-10">Product Manuals & Guides</Eyebrow>
        <div className="grid md:grid-cols-2 gap-x-12">
          {items.map((d) => (
            <a
              key={d.name}
              href={d.download ?? "/contact"}
              target={d.download ? "_blank" : undefined}
              rel={d.download ? "noopener noreferrer" : undefined}
              className="group flex items-center gap-5 py-5 border-b border-line"
            >
              <span className="relative w-20 h-20 shrink-0 bg-[#e6e6e6] border border-line overflow-hidden">
                {d.thumb && (
                  <Image src={d.thumb} alt={d.name} fill className="object-contain p-2" sizes="80px" />
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold leading-snug group-hover:text-accent-600 transition-colors">
                  {d.name}
                </span>
                {d.sub && (
                  <span className="block font-mono text-[11px] uppercase tracking-widest text-ash mt-1">
                    {d.sub}
                  </span>
                )}
              </span>
              <span className="shrink-0 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-ink group-hover:text-accent-600 transition-colors">
                Download <span aria-hidden>→</span>
              </span>
            </a>
          ))}
        </div>

        <p className="mt-12 text-ash text-sm max-w-3xl">
          Can&apos;t find a manual for your product?{" "}
          <a href="/contact" className="underline decoration-accent-600 underline-offset-2">
            Contact us
          </a>{" "}
          and we&apos;ll send it through.
        </p>
      </section>
    </>
  );
}
