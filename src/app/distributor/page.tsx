import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import StatsBand from "@/components/marketing/StatsBand";
import UspGrid from "@/components/marketing/UspGrid";
import AccordionSections from "@/components/marketing/AccordionSections";
import DistributorApplicationForm from "@/components/marketing/DistributorApplicationForm";
import Eyebrow from "@/components/ui/Eyebrow";
import JsonLd from "@/components/seo/JsonLd";
import { blogEnabled, BLOG_PREFIX } from "@/lib/opinly-content";

export const metadata: Metadata = {
  title: "Become a Distributor | International Gym Equipment Distribution",
  description:
    "Distribute MasterKraft commercial gym equipment in your country. Premium design, custom branding, consolidated global logistics and full-service support for distribution partners worldwide.",
  alternates: { canonical: "/distributor" },
};

const advantages = [
  ["High Quality", "A full range of fitness equipment that boasts premium design and functionality."],
  ["Bespoke", "In-house engineers and designers customise equipment and branding - MasterKraft or your own."],
  ["Competitive Advantage", "Strong relationships with international suppliers and partner factories to maximise your margin."],
  ["Logistics", "Global delivery via streamlined processes, stock consolidation and central warehousing - direct to your door."],
  ["Experience", "Key people who know the fitness industry, with 20+ years of importing and exporting worldwide."],
  ["Full Service", "Supply & logistics, QC, warranty management, in-house design and an online ordering & payment portal."],
];

// Who the programme suits. Deliberately broad: the existing copy says the
// opportunity is open to "individuals or businesses throughout the world", and
// this is a description of fit, not a set of eligibility rules.
const partnerTypes = [
  {
    title: "Equipment retailers & specialists",
    body: "Showrooms and online stores that already sell into gyms, studios and home buyers, and want a premium commercial range with margin left in it.",
  },
  {
    title: "Fitout & installation businesses",
    body: "Teams that build training floors and want one supplier for equipment, flooring and storage - with 3D layouts and specification support behind every quote.",
  },
  {
    title: "Sports & leisure wholesalers",
    body: "Distributors with an existing dealer network, warehousing and a customer base that is asking for commercial-grade strength equipment.",
  },
  {
    title: "Independent agents",
    body: "Industry people with relationships across gyms, franchise groups, hotels, universities and corporate facilities in their market.",
  },
];

const steps = [
  {
    n: "01",
    title: "Apply",
    body: "Tell us about your business, your territory and the customers you serve. It takes a few minutes.",
  },
  {
    n: "02",
    title: "Market review",
    body: "We review your application and arrange a call to understand your market, channel and capability.",
  },
  {
    n: "03",
    title: "Range & commercials",
    body: "Together we shape the right range, branding, pricing structure and logistics model for your territory.",
  },
  {
    n: "04",
    title: "Agreement & launch",
    body: "After trade references and mutual acceptance of terms, a formal Distribution Agreement is signed and your first order is planned.",
  },
];

// FAQ answers stay inside what the business has already said publicly - the
// application/agreement process, bespoke branding, global logistics, the portal,
// warranty management. Anything commercial (minimums, exclusivity, pricing) is
// answered as "agreed per partner" because that is the truthful answer until
// someone decides otherwise; do not put numbers here without sign-off.
const faqs = [
  {
    heading: "Which countries are you looking for distributors in?",
    body: [
      "The opportunity is open to individuals and businesses throughout the world. MasterKraft equipment is already in use across 12 countries, and we are actively looking for partners to take the range into new markets.",
      "If you are unsure whether your territory is available, apply anyway - it is the fastest way to find out.",
    ],
  },
  {
    heading: "Can I sell the equipment under my own brand?",
    body: [
      "Yes. Our in-house engineers and designers can customise equipment and branding, so you can sell the range as MasterKraft or under your own brand.",
    ],
  },
  {
    heading: "How does shipping to my country work?",
    body: [
      "We consolidate stock through central warehousing and ship direct to your door. The logistics model - freight, consolidation and lead times - is planned with each partner around their market and order profile.",
    ],
  },
  {
    heading: "Is there a minimum order or an exclusive territory?",
    body: [
      "Order commitments and territory arrangements are agreed individually with each partner as part of the Distribution Agreement. We will talk them through during the market review.",
    ],
  },
  {
    heading: "What support do distributors receive?",
    body: [
      "Supply and logistics, quality control, warranty management, in-house design support including 3D layouts, and access to an online ordering and payment portal.",
    ],
  },
  {
    heading: "Does every application get accepted?",
    body: [
      "No. The number of distributor opportunities is limited and not all applicants will be successful. MasterKraft reserves the right to accept or reject any application, and all information is treated with the strictest confidence.",
    ],
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.heading,
    acceptedAnswer: { "@type": "Answer", text: f.body.join(" ") },
  })),
};

export default function DistributorPage() {
  return (
    <>
      <JsonLd data={faqJsonLd} />
      <PageHero
        eyebrow="Wholesale"
        title="Become a Distributor"
        subtitle="Strength, durability and premium quality are the hallmarks of MasterKraft. Partner with us to bring commercial-grade equipment to your market."
        image="/home/distributor.jpg"
        breadcrumbs={[{ name: "Distributor", href: "/distributor" }]}
      />

      <StatsBand />

      {/* A global opportunity */}
      <section className="container-mk py-20 grid lg:grid-cols-[1fr_1.2fr] gap-14">
        <div>
          <Eyebrow className="mb-4">A Global Opportunity</Eyebrow>
          <h2 className="text-3xl lg:text-4xl font-bold">
            Born in Australia. Built for every market.
          </h2>
          <a href="#apply" className="btn btn-accent mt-8">
            Apply to Distribute <span aria-hidden>→</span>
          </a>
        </div>
        <div className="space-y-4 text-ash leading-relaxed">
          <p>
            Not surprisingly, people dedicated to self-improvement through fitness respond to premium
            products. Little wonder that what began as an Australian enterprise is now operating on a
            global scale.
          </p>
          <p>
            As MasterKraft expands to meet demand, we need distribution partners to bridge the gap
            between our manufacturers and our customers, both existing and potential, for the hundreds
            of items we produce.
          </p>
          <p>
            A passion for fitness, an understanding of international distribution, and a willingness to
            venture into new markets are what we want in our global team. This opportunity is open to
            individuals or businesses throughout the world.
          </p>
        </div>
      </section>

      {/* Global advantage */}
      <section className="bg-smoke">
        <div className="container-mk py-20">
          <div className="max-w-2xl mb-14">
            <Eyebrow className="mb-4">What You Get</Eyebrow>
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
        </div>
      </section>

      {/* Who we partner with */}
      <section className="container-mk py-20">
        <div className="max-w-2xl mb-14">
          <Eyebrow className="mb-4">Who We Partner With</Eyebrow>
          <h2 className="text-3xl lg:text-4xl font-bold">Built for businesses that know their market</h2>
          <p className="mt-4 text-ash leading-relaxed">
            Our best partners combine local relationships with the capability to sell, deliver and
            support commercial equipment. If that sounds like you, we want to hear from you.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {partnerTypes.map((p) => (
            <div key={p.title} className="border-t-2 border-accent pt-6">
              <h3 className="text-lg font-bold">{p.title}</h3>
              <p className="mt-3 text-ash leading-relaxed text-sm">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-ink text-white">
        <div className="container-mk py-20">
          <div className="max-w-2xl mb-14">
            <Eyebrow tone="dark" className="mb-4">How It Works</Eyebrow>
            <h2 className="text-3xl lg:text-4xl font-bold">From application to first container</h2>
          </div>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10">
            {steps.map((s) => (
              <li key={s.n} className="bg-ink p-8">
                <p className="font-mono text-accent-300 text-sm tracking-widest">{s.n}</p>
                <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
                <p className="mt-3 text-white/70 leading-relaxed text-sm">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <UspGrid eyebrow="Why Partner With Us" title="One partner behind your whole operation" />

      {/* FAQ */}
      <section className="container-mk py-20 max-w-3xl">
        <Eyebrow className="mb-4">Distributor FAQ</Eyebrow>
        <h2 className="text-3xl font-bold mb-10">Questions partners ask first</h2>
        <AccordionSections sections={faqs} />
      </section>

      {/* MARKET INSIGHTS - same gating as the Journal link on /resources:
          /blog 404s until OPINLY_CDN_NAMESPACE is set, so this only renders when
          the page it links to exists. A link rather than a post list so this
          page stays static. */}
      {blogEnabled() && (
        <section className="container-mk pb-16 max-w-3xl">
          <Eyebrow className="mb-6">Market Insights</Eyebrow>
          <p className="text-ash leading-relaxed">
            How commercial gyms buy equipment differs from country to country. The{" "}
            <Link href={BLOG_PREFIX} className="underline decoration-accent-600 underline-offset-2">
              MasterKraft Journal
            </Link>{" "}
            covers what operators in markets like New Zealand and Singapore look for when they spec
            and source a fitout.
          </p>
        </section>
      )}

      {/* Application */}
      <section id="apply" className="bg-smoke scroll-mt-24">
        <div className="container-mk py-20 grid lg:grid-cols-[1fr_1.4fr] gap-14">
          <div>
            <Eyebrow className="mb-4">Apply</Eyebrow>
            <h2 className="text-3xl lg:text-4xl font-bold">Ready to talk distribution?</h2>
            <div className="mt-6 space-y-4 text-ash leading-relaxed">
              <p>
                Tell us about your market and we&apos;ll build a partnership around it - from a pilot
                order to a full territory.
              </p>
              <p className="text-sm">
                Finalisation of any distributorship will only occur after further consultation,
                examination of trade references, mutual acceptance of terms and conditions, and
                signing of a formal Distribution Agreement.
              </p>
            </div>
          </div>
          <div className="bg-white p-5 sm:p-8 border border-line">
            <DistributorApplicationForm />
          </div>
        </div>
      </section>
    </>
  );
}
