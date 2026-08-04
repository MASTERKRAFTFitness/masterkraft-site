import Image from "next/image";
import Link from "next/link";
import Eyebrow from "@/components/ui/Eyebrow";

// Featured case study for the Commercial Gym page. Fernwood is one of Australia's
// largest women's fitness networks; MasterKraft produces their equipment in
// Fernwood's magenta brand colours. Light treatment (magenta-on-white) as a
// deliberate contrast to the dark REVL band on the Boutique page. Product renders
// use object-contain so nothing is cropped.
export default function FernwoodFeature() {
  return (
    <section className="bg-cloud">
      <div className="container-mk py-20 lg:py-24 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <Eyebrow className="mb-5">Featured Project</Eyebrow>
          <h2 className="font-display text-4xl lg:text-5xl uppercase leading-[0.95]">Fernwood Fitness</h2>
          <p className="mt-6 text-ash text-lg leading-relaxed max-w-xl">
            Custom-branded equipment for one of Australia&apos;s largest women&apos;s fitness networks.
            MasterKraft produces Fernwood&apos;s dumbbells, fixed barbells and Olympic plates in their
            signature colours, delivered club-ready across the network.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              "Equipment finished in your exact brand colours",
              "Consistent spec and branding rolled out club to club",
              "One supplier for the whole network, delivered to schedule",
            ].map((point) => (
              <li key={point} className="flex gap-3 text-ash leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-accent" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-9">
            <Link href="/contact" className="btn btn-accent">
              Brand your fit-out <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 relative aspect-[2/1] bg-white border border-line overflow-hidden">
            <Image
              src="/fernwood/curl-barbell.png"
              alt="Fernwood-branded fixed curl barbell"
              fill
              className="object-contain p-6"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
          <div className="relative aspect-square bg-white border border-line overflow-hidden">
            <Image
              src="/fernwood/dumbbell.png"
              alt="Fernwood-branded round dumbbell"
              fill
              className="object-contain p-5"
              sizes="(max-width: 1024px) 50vw, 25vw"
            />
          </div>
          <div className="relative aspect-square bg-white border border-line overflow-hidden">
            <Image
              src="/fernwood/tri-grip-plate.jpg"
              alt="Fernwood-branded tri-grip Olympic plate"
              fill
              className="object-contain p-5"
              sizes="(max-width: 1024px) 50vw, 25vw"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
