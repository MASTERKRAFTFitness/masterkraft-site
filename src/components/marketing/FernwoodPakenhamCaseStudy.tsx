import Image from "next/image";
import Link from "next/link";
import Eyebrow from "@/components/ui/Eyebrow";

// Case study for the Franchise Gym page: Fernwood Fitness Pakenham (VIC), a new
// club in one of Australia's largest women's fitness franchise networks.
//
// Scope and quantities are taken from Unleashed sales order SO-00000806 (customer
// FERN-VIC-Pakenham, Completed). The F-prefixed lines on it are Fernwood's own
// branded range. Some equipment in the photos came from other suppliers - the
// Matrix racks and plate-loaded machines, the Balanced Body reformers, the
// flooring and the studio build - so the captions name what each shot shows and
// the copy never claims the whole club. Keep it that way if this is edited, and
// re-check the order before changing a number.
//
// Photos: /public/fernwood/pakenham/NN.jpg, taken in the club.
const STATS = [
  { value: "164", label: "Fernwood-branded Olympic plates" },
  { value: "120", label: "Competition bumper plates" },
  { value: "36", label: "Competition kettlebells" },
  { value: "3", label: "Power racks & lifting platforms" },
];

const SUPPLIED = [
  {
    title: "Fernwood-branded strength",
    body: "164 urethane 4-grip Olympic plates, 20 pairs of fixed dumbbells, 5 fixed barbells, 32 competition kettlebells, plyo boxes and glider discs, all finished in Fernwood's magenta.",
  },
  {
    title: "Lifting",
    body: "3 Olympic power racks with spotter arms, J-hooks and dip bars; 3 integrated lifting platforms; 7 Olympic barbells and 2 hex bars; 120 competition bumpers and 40 change plates.",
  },
  {
    title: "Conditioning",
    body: "Concept2 SkiErg and RowErg, a curved treadmill and an air bike, with battle ropes, power bags, dead balls and medicine balls.",
  },
  {
    title: "Functional & recovery",
    body: "A full run of rubber hex dumbbells from 1 to 20 kg, suspension trainers, a landmine, balance trainers, foam rollers, mats and resistance bands.",
  },
  {
    title: "Storage",
    body: "Kettlebell, dumbbell, barbell and ball racks, plate trees and toaster racks, and wall-mounted storage for mats and rollers.",
  },
];

const GALLERY = [
  {
    src: "/fernwood/pakenham/01.jpg",
    alt: "FIIT30 studio at Fernwood Pakenham with MasterKraft kettlebells, barbells, bumper plates and dumbbells",
    caption: "FIIT30 studio",
  },
  {
    src: "/fernwood/pakenham/02.jpg",
    alt: "Lifting platforms at Fernwood Pakenham loaded with MasterKraft bumper plates and barbells, Concept2 SkiErg to the left",
    caption: "Lifting platforms",
  },
  {
    src: "/fernwood/pakenham/03.jpg",
    alt: "Fernwood-branded 5 kg and 10 kg 4-grip urethane Olympic plates in magenta script",
    caption: "Fernwood-branded plates",
  },
  {
    src: "/fernwood/pakenham/04.jpg",
    alt: "Plate-loaded strength machine stacked with Fernwood-branded Olympic plates",
    caption: "Plate-loaded strength",
  },
  {
    src: "/fernwood/pakenham/05.jpg",
    alt: "Fernwood Pakenham's barre and mat studio with arched mirrors and timber floors",
    caption: "Barre studio",
  },
  {
    src: "/fernwood/pakenham/06.jpg",
    alt: "Fernwood Pakenham's reformer pilates studio",
    caption: "Reformer studio",
  },
];

export default function FernwoodPakenhamCaseStudy() {
  return (
    <>
      <section id="fernwood-pakenham" className="bg-cloud border-t border-line scroll-mt-24">
        <div className="container-mk py-20 lg:py-24 grid lg:grid-cols-2 gap-14 items-start">
          <div>
            <Eyebrow className="mb-5">Case Study</Eyebrow>
            <h2 className="font-display text-4xl lg:text-5xl uppercase leading-[0.95]">
              Fernwood Fitness Pakenham
            </h2>
            <p className="mt-3 font-mono text-sm uppercase tracking-widest text-ash">Pakenham, VIC</p>
            <div className="mt-6 space-y-5 text-lg text-ash leading-relaxed max-w-xl">
              <p className="text-ink">
                Fernwood is one of Australia&apos;s largest women&apos;s fitness networks, and
                Pakenham is a full-format club: a strength floor, a FIIT30 studio, lifting
                platforms, and dedicated barre and reformer rooms.
              </p>
              <p>
                MasterKraft supplied the free weights, the lifting area, the conditioning kit
                and the storage that holds it all: more than 580 pieces on a single order. The plates, fixed weights and kettlebells are produced in
                Fernwood&apos;s own magenta, the same range the network orders club to club, so
                the strength floor at Pakenham carries the brand the way the signage does.
              </p>
            </div>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link href="/fitout-solution" className="btn btn-accent">
                Brand your network <span aria-hidden>→</span>
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
          <Eyebrow className="mb-10">Inside Fernwood Pakenham</Eyebrow>
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
