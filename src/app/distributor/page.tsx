import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import StatsBand from "@/components/marketing/StatsBand";
import UspGrid from "@/components/marketing/UspGrid";

export const metadata: Metadata = {
  title: "Become a Distributor",
  description:
    "Partner with MasterKraft. Premium design, custom branding, global logistics and full-service support for distributors worldwide.",
};

const advantages = [
  ["High Quality", "A full range of fitness equipment that boasts premium design and functionality."],
  ["Bespoke", "In-house engineers and designers customise equipment and branding - MasterKraft or your own."],
  ["Competitive Advantage", "Strong relationships with international suppliers and partner factories to maximise your margin."],
  ["Logistics", "Global delivery via streamlined processes, stock consolidation and central warehousing - direct to your door."],
  ["Experience", "Key people who know the fitness industry, with 20+ years of importing and exporting worldwide."],
  ["Full Service", "Supply & logistics, QC, warranty management, in-house design and an online ordering & payment portal."],
];

export default function DistributorPage() {
  return (
    <>
      <PageHero
        eyebrow="Wholesale"
        title="Become a Distributor"
        subtitle="Strength, durability and premium quality are the hallmarks of MasterKraft. Partner with us to supply the world's most demanding fitness markets."
        image="/home/distributor.jpg"
      />

      <StatsBand />

      {/* Global advantage */}
      <section className="container-mk py-20">
        <div className="max-w-2xl mb-14">
          <h2 className="text-3xl lg:text-4xl font-bold">The MasterKraft Global Advantage</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line">
          {advantages.map(([title, body]) => (
            <div key={title} className="bg-white p-8">
              <h3 className="text-lg font-bold">{title}</h3>
              <p className="mt-3 text-ash leading-relaxed text-sm">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* A global opportunity */}
      <section className="container-mk pb-4 max-w-3xl">
        <h2 className="text-2xl lg:text-3xl font-bold">A global opportunity</h2>
        <div className="mt-6 space-y-4 text-ash leading-relaxed">
          <p>
            Not surprisingly, people dedicated to self-improvement through fitness respond to premium
            products. Little wonder that what began as an Australian enterprise is now operating on a
            global scale.
          </p>
          <p>
            As MasterKraft expands to meet demand, we need distribution agents to bridge the gap
            between our manufacturers and our customers, both existing and potential, for the hundreds
            of items we produce.
          </p>
          <p>
            A passion for fitness, an understanding of international distribution, and a willingness to
            venture into new markets are what we want in our global team. If you feel you are up for the
            challenge, we would love to hear from you. This opportunity is open to individuals or
            businesses throughout the world.
          </p>
        </div>
      </section>

      {/* Join our distribution partners */}
      <section className="container-mk py-14 max-w-3xl">
        <h2 className="text-2xl lg:text-3xl font-bold">Join our distribution partners</h2>
        <div className="mt-6 space-y-4 text-ash leading-relaxed">
          <p>
            MasterKraft welcomes enquiries regarding distributorship of our premium gym and fitness
            products, from sports stores, fitness equipment specialists and beyond, as we are constantly
            looking for opportunities to expand our global reach.
          </p>
          <p>
            To best assess your experience and suitability, we ask distributor applicants to complete an
            application. Please be aware that the number of distributor opportunities is limited and not
            all applicants will be successful.
          </p>
          <p>
            MasterKraft reserves the right to accept or reject any application. Finalisation of any
            distributorship will only occur after further consultation, examination of trade references,
            mutual acceptance of terms and conditions, and signing of a formal Distribution Agreement.
            All information is treated with the strictest confidence.
          </p>
        </div>
      </section>

      <UspGrid eyebrow="Why Partner With Us" title="One partner behind your whole operation" />

      {/* CTA */}
      <section className="bg-ink text-white">
        <div className="container-mk py-20 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold">Ready to talk distribution?</h2>
          <p className="mt-4 text-white/70 max-w-2xl mx-auto">
            Tell us about your market and we&apos;ll build a partnership around it - from a pilot
            order to a full territory.
          </p>
          <Link href="/contact" className="btn btn-accent mt-8">
            Enquire Now <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
