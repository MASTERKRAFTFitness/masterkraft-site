import type { Metadata } from "next";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Buyer's guides, installation guides and product manuals for MasterKraft equipment.",
};

const groups: { category: string; items: string[] }[] = [
  {
    category: "Flooring",
    items: ["Rubber Tile Installation Guide", "Flooring Technical Brochure"],
  },
  {
    category: "Cardio - Ski & Row",
    items: [
      "Ski Trainer Elite - Owner's Manual",
      "Ski Trainer Elite - Console Manual",
      "Ski Trainer Pro - Owner's Manual",
      "Air Rower Elite - Owner's Manual",
      "Air Rower Pro - Owner's Manual",
      "Air Rower Pro - Console Manual",
    ],
  },
  {
    category: "Cardio - Bikes",
    items: [
      "Air Bike Elite - Owner's Manual",
      "Air Bike Pro - Owner's Manual",
      "Air Bike Classic - Owner's Manual",
      "Air Cycle Pro - Owner's Manual",
      "Air Cycle Elite - Owner's Manual",
    ],
  },
  {
    category: "Cardio - Treadmills",
    items: [
      "Curved Treadmill Pro - Assembly Guide",
      "Curved Treadmill Pro - Console Manual",
      "Curved Treadmill Elite - Assembly Manual",
      "Curved Treadmill Elite - Part List",
    ],
  },
];

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
                {g.items.map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="flex items-center justify-between gap-3 border border-line px-4 py-3.5 hover:border-accent hover:text-accent-600 transition-colors group"
                    >
                      <span className="text-sm">{item}</span>
                      <DownloadIcon />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-14 text-ash text-sm">
          Can&apos;t find what you need?{" "}
          <a href="/contact" className="underline decoration-accent-600 underline-offset-2">
            Contact us
          </a>{" "}
          and we&apos;ll send it through.
        </p>
      </section>
    </>
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
