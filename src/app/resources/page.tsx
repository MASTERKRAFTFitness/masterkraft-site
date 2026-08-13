import type { Metadata } from "next";
import Image from "next/image";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Buyer's guides, installation guides and product manuals for MasterKraft equipment.",
};

// `href` = a working PDF (hosted locally so it can't break). Items without an
// href are manuals not currently available as a file; they link to Contact so
// a customer can request them rather than hitting a dead download.
type Item = { name: string; href?: string };

const groups: { category: string; items: Item[] }[] = [
  {
    category: "Flooring",
    items: [
      { name: "Rubber Tile Installation Guide", href: "/manuals/rubber-tile-installation-guide.pdf" },
      { name: "Flooring Technical Brochure", href: "/manuals/flooring-technical-brochure.pdf" },
    ],
  },
  {
    category: "Cardio - Ski & Row",
    items: [
      { name: "Ski Trainer Elite - Owner's Manual" },
      { name: "Ski Trainer Elite - Console Manual" },
      { name: "Ski Trainer Pro - Owner's Manual" },
      { name: "Air Rower Elite - Owner's Manual" },
      { name: "Air Rower Pro - Owner's Manual" },
      { name: "Air Rower Pro - Console Manual" },
    ],
  },
  {
    category: "Cardio - Bikes",
    items: [
      { name: "Air Bike Elite - Owner's Manual" },
      { name: "Air Bike Pro - Owner's Manual" },
      { name: "Air Bike Classic - Owner's Manual" },
      { name: "Air Cycle Pro - Owner's Manual" },
      { name: "Air Cycle Elite - Owner's Manual" },
    ],
  },
  {
    category: "Cardio - Treadmills",
    items: [
      { name: "Curved Treadmill Pro - Assembly Guide", href: "/manuals/curved-treadmill-pro-assembly-guide.pdf" },
      { name: "Curved Treadmill Pro - Console Manual" },
      { name: "Curved Treadmill Elite - Assembly Manual" },
      { name: "Curved Treadmill Elite - Part List" },
    ],
  },
];

// Thumbnail rendered from the document's own first page (generated from the PDF
// into /manuals/thumbs/<name>.png). Returns null when there's no file to render.
function docThumb(href?: string): string | null {
  if (!href) return null;
  return href.replace("/manuals/", "/manuals/thumbs/").replace(/\.pdf$/, ".png");
}

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Guides & Product Manuals"
        subtitle="Need help to assemble your equipment or get the most out of your products? Find buyer's guides, installation guides and product manuals here."
      />

      <section className="container-mk py-20">
        <Eyebrow className="mb-10">Product Manuals & Assembly Guides</Eyebrow>
        <div className="space-y-14">
          {groups.map((g) => (
            <div key={g.category}>
              <h2 className="text-xl font-bold border-b border-line pb-3">{g.category}</h2>
              <ul className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {g.items.map((item) => {
                  const thumb = docThumb(item.href);
                  return item.href ? (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 border border-line p-3 hover:border-accent hover:text-accent-600 transition-colors group"
                      >
                        <span className="w-12 h-12 shrink-0 overflow-hidden border border-line bg-white">
                          <Image
                            src={thumb!}
                            alt={`First page of ${item.name}`}
                            width={48}
                            height={48}
                            className="w-full h-full object-cover object-top"
                          />
                        </span>
                        <span className="text-sm flex-1">{item.name}</span>
                        <DownloadIcon />
                      </a>
                    </li>
                  ) : (
                    <li key={item.name}>
                      <a
                        href="/contact"
                        className="flex items-center gap-3 border border-line p-3 hover:border-accent transition-colors group"
                        title="Request this manual"
                      >
                        <DocPlaceholder />
                        <span className="text-sm flex-1 text-ash group-hover:text-ink transition-colors">{item.name}</span>
                        <span className="shrink-0 font-mono text-[10px] tracking-widest uppercase text-ash group-hover:text-accent-600">
                          Request →
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-14 text-ash text-sm">
          Can&apos;t find what you need, or need a manual marked{" "}
          <span className="font-mono text-[10px] tracking-widest uppercase">Request</span>?{" "}
          <a href="/contact" className="underline decoration-accent-600 underline-offset-2">
            Contact us
          </a>{" "}
          and we&apos;ll send it through.
        </p>
      </section>
    </>
  );
}

// Neutral document mark for manuals that aren't yet available as a file — no
// brand image, so it reads as "a document" rather than a product photo.
function DocPlaceholder() {
  return (
    <span className="w-12 h-12 shrink-0 grid place-items-center border border-line bg-smoke text-ash">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
        <line x1="8" y1="9" x2="10" y2="9" />
      </svg>
    </span>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-ash group-hover:text-accent"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
