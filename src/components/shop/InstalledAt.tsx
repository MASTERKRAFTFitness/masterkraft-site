import Image from "next/image";
import Link from "next/link";
import Eyebrow from "@/components/ui/Eyebrow";
import type { InstallShowcase } from "@/lib/installed-at";

// A product in a real club: a row of install photos and a link to the case study.
export default function InstalledAt({ showcase }: { showcase: InstallShowcase }) {
  return (
    <section className="border-t border-line">
      <div className="container-mk py-14">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
          <div className="max-w-2xl">
            <Eyebrow className="mb-4">Installed at</Eyebrow>
            <h2 className="text-2xl font-bold">{showcase.club}</h2>
            <p className="mt-1 font-mono text-xs uppercase tracking-widest text-ash">{showcase.place}</p>
            <p className="mt-4 text-ash leading-relaxed">{showcase.note}</p>
          </div>
          <Link
            href={showcase.href}
            className="inline-flex items-center gap-2 font-mono text-xs tracking-widest uppercase text-accent-600 hover:text-accent"
          >
            See the fitout <span aria-hidden>→</span>
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {showcase.photos.map((p) => (
            <figure key={p.src}>
              <div className="relative aspect-[4/3] overflow-hidden bg-carbon">
                <Image src={p.src} alt={p.alt} fill className="object-cover" sizes="(max-width: 768px) 50vw, 33vw" />
              </div>
              <figcaption className="mt-2 font-mono text-xs uppercase tracking-widest text-ash">{p.caption}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
