import type { Metadata } from "next";
import Image from "next/image";
import PageHero from "@/components/marketing/PageHero";
import Marquee from "@/components/marketing/Marquee";
import Eyebrow from "@/components/ui/Eyebrow";

export const metadata: Metadata = {
  title: "Our Story",
  description:
    "The power of passion - expertly engineered gym equipment for commercial and corporate fitouts globally. Made by fitness professionals, for fitness professionals.",
};

const values = [
  {
    title: "Fairness",
    body: "There is no partnership without fairness. We will always be open and honest, act with impartiality and strive for a win/win in all our business transactions. We believe in our global fitness partners, we respect them, and will respond to their needs without discrimination.",
  },
  {
    title: "Integrity",
    body: "We speak your language, and we follow through on our word. With decades of experience in the fitness industry, we understand and respect the individual needs of gym operators, and communicate candidly and transparently.",
  },
  {
    title: "Accountability",
    body: "Remaining accountable is the basis of our customer service. You deserve full confidence in the products you buy and the service you receive. We commit to being responsible and outcome-driven so we can support you in your success.",
  },
];

export default function OurStoryPage() {
  return (
    <>
      <PageHero
        eyebrow="Our Story"
        title="The Power of Passion"
        subtitle="Everything MasterKraft creates is imbued with a passion to make it better - beyond anything else created by any other fitness brand."
        image="/home/hero-2.jpg"
      />

      {/* Brand values intro */}
      <section className="container-mk py-20">
        <div className="max-w-3xl">
          <Eyebrow className="mb-4">Our Brand Values</Eyebrow>
          <p className="text-xl text-ink leading-relaxed">
            MasterKraft produces a powerful line of expertly engineered gym equipment for
            commercial and corporate gym fitouts globally. We offer quality, functionality
            and durability that is second to none.
          </p>
        </div>
        <div className="mt-14 grid md:grid-cols-3 gap-8">
          {values.map((v) => (
            <div key={v.title} className="border-t-2 border-accent pt-6">
              <h3 className="text-xl font-bold">{v.title}</h3>
              <p className="mt-3 text-ash leading-relaxed">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Marquee />

      {/* The MasterKraft Way */}
      <section className="bg-ink text-white">
        <div className="container-mk py-20 grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <Eyebrow tone="dark" className="mb-4">The MasterKraft Way</Eyebrow>
            <h2 className="text-3xl lg:text-4xl font-bold">
              We innovate where others make do
            </h2>
            <div className="mt-6 space-y-4 text-white/70 leading-relaxed">
              <p>
                In a challenging global marketplace, only the strong survive - which is why
                MasterKraft works tirelessly to innovate where others make do, constantly
                evolving research and development in our mission to supply premium gym
                equipment beyond compare.
              </p>
              <p>
                Our insistence upon superb quality redefines what gym equipment is capable of.
                Made by fitness professionals for fitness professionals, MasterKraft can help
                transform any available space into the most powerful, functional fitness zone
                imaginable.
              </p>
            </div>
          </div>
          <div className="relative aspect-[4/3]">
            <Image src="/home/distributor.jpg" alt="MasterKraft engineering" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
          </div>
        </div>
      </section>

      {/* Engineering */}
      <section className="container-mk py-20 max-w-3xl">
        <Eyebrow className="mb-4">Engineered for Fitness</Eyebrow>
        <h2 className="text-3xl font-bold">Engineering - our core strength</h2>
        <div className="mt-6 space-y-4 text-ash leading-relaxed">
          <p>
            At MasterKraft, we&apos;re driven by a passion for perfection. Only through
            understanding the gyms and the athletes who demand the best can we conceive the
            ultimate in gym and fitness equipment - and only through a painstaking process of
            fine engineering can we create something special.
          </p>
          <p>
            Every piece of MasterKraft equipment is the result of a long and scrupulous
            research and development phase. Precise, intelligent engineering is at the core of
            every piece, ensuring an ideal amalgam of strength, functionality and aesthetics.
          </p>
          <p>
            Because of who we are, MasterKraft will never stop questioning, developing and
            innovating. It&apos;s in our genetic code. Through precision engineering and
            constant forward momentum, we will continue to serve discerning gym operators
            across the globe.
          </p>
        </div>
      </section>
    </>
  );
}
