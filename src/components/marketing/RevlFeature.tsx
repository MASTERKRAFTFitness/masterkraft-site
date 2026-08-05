import Image from "next/image";
import Link from "next/link";
import Eyebrow from "@/components/ui/Eyebrow";

// Featured case study for the Boutique Fitness page. REVL is a real boutique
// studio brand MasterKraft fitted out end-to-end (Brighton + Campbelltown), so
// it doubles as proof for the boutique pitch. Dark band to match REVL's look.
export default function RevlFeature() {
  return (
    <section className="bg-carbon text-white">
      <div className="container-mk py-20 lg:py-24 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <Eyebrow tone="dark" className="mb-5">
            Featured Project
          </Eyebrow>
          <h2 className="font-display text-4xl lg:text-5xl uppercase leading-[0.95]">REVL Training</h2>
          <p className="mt-6 text-white/75 text-lg leading-relaxed max-w-xl">
            MasterKraft has fitted out every REVL studio across Australia and Singapore, delivering each
            complete floor (rigs, functional zones, conditioning gear, storage and branded flooring) in a
            single container, coordinated to REVL&apos;s identity and built for back-to-back group classes.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link href="/revl-fitouts" className="btn btn-accent">
              See the REVL fit-outs <span aria-hidden>→</span>
            </Link>
            <Link href="/contact" className="btn btn-out !text-white">
              Start your studio
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="relative aspect-[4/5] overflow-hidden">
            <Image
              src="/revl/branded-wall.jpg"
              alt="REVL studio with branded wall and equipment"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 50vw, 25vw"
            />
          </div>
          <div className="relative aspect-[4/5] overflow-hidden">
            <Image
              src="/revl/rigs.jpg"
              alt="REVL training floor rig and conditioning equipment"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 50vw, 25vw"
            />
          </div>
          <div className="relative aspect-[16/9] col-span-2 overflow-hidden">
            <Image
              src="/revl/team.jpg"
              alt="The REVL community after a group class"
              fill
              className="object-cover"
              style={{ objectPosition: "center 35%" }}
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
