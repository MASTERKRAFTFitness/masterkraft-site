import Image from "next/image";
import Link from "next/link";
import Eyebrow from "@/components/ui/Eyebrow";

// Case study shown on the Franchise Gym and Commercial Gym pages, under Fernwood
// Pakenham: Fernwood Fitness Hornsby (NSW), a functional-zone refit installed by
// MasterKraft's own crew in November 2026.
//
// Scope and quantities are taken from Unleashed sales order SO-00000843 (customer
// FERN-NSW-Hornsby): 280 Impact-Lock 20 mm rubber tiles (1 m x 1 m each), one
// Fernwood-branded 2 m x 10 m turf track with metre markings, two Functional
// Training System 2.0 rigs with Fernwood pink accessories, freight and installation.
// Nothing else in the photos is on that order - the sled, plyo boxes, dumbbells,
// medicine balls and slam balls in the storage bays, the treadmills and the
// strength machines came from elsewhere - so the copy and captions credit only the
// floor, the track and the rigs. Keep it that way if this is edited, and re-check
// the order before changing a number.
//
// Photos: /public/fernwood/hornsby/NN.jpg, taken in the club during and after the
// install (Dropbox folder HORNSBY-INSTALLATION, 22 Nov 2026).
const STATS = [
  { value: "280 m²", label: "Impact-Lock rubber flooring" },
  { value: "10 m", label: "Fernwood-branded turf track" },
  { value: "2", label: "Functional training rigs" },
  { value: "1", label: "Order: supplied, delivered and installed" },
];

const SUPPLIED = [
  {
    title: "Flooring",
    body: "280 square metres of 20 mm Impact-Lock interlocking rubber tiles, laid straight over the club's old floor and run through the functional zone and the cardio line.",
  },
  {
    title: "Branded turf track",
    body: "A 2 m x 10 m black turf track printed with the Fernwood script and metre markings, made to order for the club's sled and conditioning work.",
  },
  {
    title: "Functional Training System 2.0",
    body: "Two wall-run rig systems with storage bays and Fernwood-pink spotter arms, J-hooks and chin-up bars, so every station on the wall carries the brand colour.",
  },
  {
    title: "Installation",
    body: "Delivered and installed by MasterKraft's crew: floor down, rigs built and anchored, and the zone handed back ready to train.",
  },
];

const GALLERY = [
  {
    src: "/fernwood/hornsby/01.jpg",
    alt: "Fernwood Hornsby's finished functional zone: Fernwood-branded turf track on new rubber flooring, with black and pink training rigs along the wall",
    caption: "Functional zone",
  },
  {
    src: "/fernwood/hornsby/02.jpg",
    alt: "Black turf track printed with the Fernwood Fitness script in pink",
    caption: "Branded turf track",
  },
  {
    src: "/fernwood/hornsby/03.jpg",
    alt: "Functional Training System 2.0 rig with Fernwood-pink spotter arms, J-hooks and a loaded barbell",
    caption: "Functional Training System",
  },
  {
    src: "/fernwood/hornsby/04.jpg",
    alt: "Impact-Lock rubber tiles running along the cardio line at Fernwood Hornsby",
    caption: "Impact-Lock flooring",
  },
  {
    src: "/fernwood/hornsby/05.jpg",
    alt: "A MasterKraft installer building the wall-run rig and storage bays at Fernwood Hornsby",
    caption: "Install: rigs going up",
  },
  {
    src: "/fernwood/hornsby/06.jpg",
    alt: "Rig frames and pink spotter arms laid out on the new rubber floor before assembly",
    caption: "Install: new floor down",
  },
];

export default function FernwoodHornsbyCaseStudy() {
  return (
    <>
      <section id="fernwood-hornsby" className="bg-cloud border-t border-line scroll-mt-24">
        <div className="container-mk py-20 lg:py-24 grid lg:grid-cols-2 gap-14 items-start">
          <div>
            <Eyebrow className="mb-5">Case Study</Eyebrow>
            <h2 className="font-display text-4xl lg:text-5xl uppercase leading-[0.95]">
              Fernwood Fitness Hornsby
            </h2>
            <p className="mt-3 font-mono text-sm uppercase tracking-widest text-ash">Hornsby, NSW</p>
            <div className="mt-6 space-y-5 text-lg text-ash leading-relaxed max-w-xl">
              <p className="text-ink">
                Hornsby&apos;s functional zone now looks and trains like a Fernwood space: a
                proper floor, a sled track and a wall of rigs, all in the network&apos;s
                colours.
              </p>
              <p>
                MasterKraft supplied and installed the lot. Our crew laid 280 square metres
                of Impact-Lock rubber over the old floor, rolled out a 10-metre turf track
                printed with the Fernwood script and metre markings, and built two
                Functional Training System rigs with Fernwood-pink spotter arms, J-hooks and
                chin-up bars. One order and one crew, from bare floor to finished rig.
              </p>
            </div>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link href="/fitout-solution" className="btn btn-accent">
                Plan your refit <span aria-hidden>→</span>
              </Link>
            </div>
          </div>

          <div>
            <dl className="grid grid-cols-2 gap-px bg-line border border-line mb-10">
              {STATS.map((st) => (
                <div key={st.label} className="bg-white p-5">
                  <dt className="sr-only">{st.label}</dt>
                  <dd>
                    <span className="block font-display text-4xl text-accent-600">{st.value}</span>
                    <span className="mt-1 block text-sm text-ash leading-snug">{st.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <h3 className="text-sm tracking-widest text-ash mb-5">What MasterKraft supplied</h3>
            <ul className="divide-y divide-line border-y border-line">
              {SUPPLIED.map((item) => (
                <li key={item.title} className="py-5 flex gap-4">
                  <span className="mt-2 h-2.5 w-2.5 shrink-0 bg-accent" aria-hidden />
                  <div>
                    <p className="font-display uppercase tracking-wide text-ink">{item.title}</p>
                    <p className="mt-1 text-ash leading-relaxed">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-smoke border-t border-line">
        <div className="container-mk py-20">
          <Eyebrow className="mb-10">Inside Fernwood Hornsby</Eyebrow>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {GALLERY.map((g) => (
              <figure key={g.src}>
                <div className="relative aspect-[3/4] overflow-hidden bg-carbon">
                  <Image
                    src={g.src}
                    alt={g.alt}
                    fill
                    className="object-cover transition-transform duration-500 hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 33vw"
                  />
                </div>
                <figcaption className="mt-2 font-mono text-xs uppercase tracking-widest text-ash">
                  {g.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
