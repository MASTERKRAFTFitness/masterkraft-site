import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import AccordionSections from "@/components/marketing/AccordionSections";
import ContactForm from "@/components/marketing/ContactForm";
import Eyebrow from "@/components/ui/Eyebrow";
import JsonLd from "@/components/seo/JsonLd";
import { ENQUIRY_KIND } from "@/lib/enquiry-type";
import {
  BRANDING_LINES,
  BRANDING_MIN_ORDER,
  METHODS,
  METHOD_LABEL,
  METHOD_NOTE,
  TOOLING_WAIVER_SPEND,
  formatAud,
  incGst,
} from "@/lib/custom-branding";

export const metadata: Metadata = {
  title: "Independent Gyms | Franchise-Level Pricing & Custom Branded Equipment",
  description:
    "Join the MasterKraft buying group for independent gyms: franchise-level pricing on quarterly orders, a personalised catalogue, and custom branded plates, dumbbells, kettlebells and balls with transparent setup fees.",
  alternates: { canonical: "/independent-gyms" },
};

const benefits = [
  [
    "Franchise-level pricing",
    "Pool your buying power with other independent gyms and pay the kind of prices usually reserved for national franchise networks.",
  ],
  [
    "Your own catalogue",
    "Every member gets a personalised catalogue with tiered pricing, built around your floor and your members rather than a generic price list.",
  ],
  [
    "Quarterly ordering",
    "Plan your equipment spend around a quarterly order cycle, so you can budget ahead and replace worn kit before it becomes a problem.",
  ],
  [
    "Your brand on the floor",
    "Put your logo on the equipment your members touch every day: plates, dumbbells, kettlebells, balls and studio gear.",
  ],
];

const steps = [
  { n: "01", title: "Join", body: "Tell us about your gym. It takes two minutes." },
  { n: "02", title: "Welcome", body: "We'll be in touch to understand your floor, your members and what you buy through the year." },
  { n: "03", title: "Your catalogue", body: "We build a personalised catalogue with tiered buying-group pricing for your gym." },
  { n: "04", title: "Order quarterly", body: "Place your orders each quarter, add branding when you're ready, and we handle the rest." },
];

// Plain-language versions of the three notes on Steve's sheet. The tooling
// allowance percentages on that sheet are a sales lever, not a public price, and
// are deliberately not shown here.
const brandingTerms = [
  {
    title: `From ${formatAud(BRANDING_MIN_ORDER)} in orders`,
    body: `Custom branding is available once your orders with us reach ${formatAud(
      BRANDING_MIN_ORDER
    )}. Until then, you get the full range in MasterKraft branding.`,
  },
  {
    title: `Under ${formatAud(TOOLING_WAIVER_SPEND)} a year`,
    body: "Choose MasterKraft-branded equipment at no extra cost, or add your own branding with the setup fees below invoiced once, upfront. You pay for each size's tooling once.",
  },
  {
    title: `${formatAud(TOOLING_WAIVER_SPEND)}+ in your first 12 months`,
    body: `No upfront tooling. A small percentage is added to your pricing tier instead, and it comes off once your purchases reach ${formatAud(
      TOOLING_WAIVER_SPEND
    )}.`,
  },
];

const faqs = [
  {
    heading: "Who can join the buying group?",
    body: [
      "Any independently owned gym, studio or training facility in Australia - from a single PT studio to a multi-site operator that isn't part of a franchise network.",
    ],
  },
  {
    heading: "Are the branding fees per item?",
    body: [
      "No. Each fee is a one-off setup charge per size, which pays for the mould, laser file, print screen or label for that size. Once it is made, every unit you order in that size carries your logo at no extra setup cost.",
      "For example, moulding your logo into all seven sizes of our 4-grip urethane plates is 7 × $650 = $4,550 ex GST, once.",
    ],
  },
  {
    heading: "Are the prices ex GST?",
    body: [
      "Yes. The matrix shows each setup fee ex GST, with the GST-inclusive figure underneath. Equipment is priced separately in your catalogue.",
    ],
  },
  {
    heading: "Which branding method should I choose?",
    body: [
      "Moulding is the most premium and permanent finish, and suits plates and dumbbells that take a beating. Laser engraving is crisp with a lower setup fee. Printing and PVC labels are the quickest and lowest-cost way to put your logo on balls, kettlebells and fixed dumbbells.",
    ],
  },
  {
    heading: "Can I brand only some sizes?",
    body: [
      "Yes. Setup fees are charged per size, so you can brand the sizes your members see most - your working-weight dumbbells, say - and keep the rest in MasterKraft branding.",
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

const groups = Array.from(new Set(BRANDING_LINES.map((l) => l.group)));

export default function IndependentGymsPage() {
  return (
    <>
      <JsonLd data={faqJsonLd} />
      <PageHero
        eyebrow="Independent Gyms"
        title="Franchise buying power for independent gyms"
        subtitle="Join the MasterKraft buying group for franchise-level pricing on commercial equipment, and put your own brand on the floor."
        image="/home/hero-2.jpg"
        breadcrumbs={[{ name: "Independent Gyms", href: "/independent-gyms" }]}
      />

      {/* Intro */}
      <section className="container-mk py-20 grid lg:grid-cols-[1fr_1.2fr] gap-14">
        <div>
          <Eyebrow className="mb-4">The Buying Group</Eyebrow>
          <h2 className="text-3xl lg:text-4xl font-bold">The prices the big networks pay. For your gym.</h2>
          <a href="#join" className="btn btn-accent mt-8">
            Join the Buying Group <span aria-hidden>→</span>
          </a>
        </div>
        <div className="space-y-4 text-ash leading-relaxed">
          <p>
            Franchise networks get better equipment prices because they buy together. Independent gyms
            have always paid more for the same kit, simply because they buy alone.
          </p>
          <p>
            The MasterKraft buying group changes that. Independent gyms order through one program on a
            quarterly cycle, and every member gets franchise-level pricing on the commercial-grade
            equipment we already supply to networks across Australia.
          </p>
          <p>
            And when you&apos;re ready to make the floor unmistakably yours, we&apos;ll put your logo on
            it.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-smoke">
        <div className="container-mk py-20">
          <div className="max-w-2xl mb-14">
            <Eyebrow className="mb-4">What You Get</Eyebrow>
            <h2 className="text-3xl lg:text-4xl font-bold">Built for owner-operators</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line">
            {benefits.map(([title, body]) => (
              <div key={title} className="bg-white p-8">
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="mt-3 text-ash leading-relaxed text-sm">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-ink text-white">
        <div className="container-mk py-20">
          <div className="max-w-2xl mb-14">
            <Eyebrow tone="dark" className="mb-4">How It Works</Eyebrow>
            <h2 className="text-3xl lg:text-4xl font-bold">From sign-up to first order</h2>
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

      {/* Branding methods */}
      <section id="branding" className="container-mk py-20 scroll-mt-24">
        <div className="max-w-2xl mb-14">
          <Eyebrow className="mb-4">Custom Branded Equipment</Eyebrow>
          <h2 className="text-3xl lg:text-4xl font-bold">Your logo, four ways</h2>
          <p className="mt-4 text-ash leading-relaxed">
            Every branding option has a transparent, one-off setup fee per size. Pay it once and every
            unit you order in that size carries your brand.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {METHODS.map((m) => (
            <div key={m} className="border-t-2 border-accent pt-6">
              <h3 className="text-lg font-bold">{METHOD_LABEL[m]}</h3>
              <p className="mt-3 text-ash leading-relaxed text-sm">{METHOD_NOTE[m]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Price matrix */}
      <section className="container-mk pb-20">
        <div className="max-w-2xl mb-8">
          <h2 className="text-2xl lg:text-3xl font-bold">Branding setup fees</h2>
          <p className="mt-3 text-ash text-sm leading-relaxed">
            One-off fee per size, AUD ex GST (inc GST underneath). A dash means that method isn&apos;t
            available for that product.
          </p>
        </div>
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">
              Custom branding setup fees per size, by product and branding method
            </caption>
            <thead className="bg-ink text-white">
              <tr>
                <th scope="col" className="text-left font-semibold p-4">Product</th>
                <th scope="col" className="text-right font-semibold p-4">Sizes</th>
                {METHODS.map((m) => (
                  <th key={m} scope="col" className="text-right font-semibold p-4">
                    {METHOD_LABEL[m]}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g}>
                <tr className="bg-smoke">
                  <th
                    scope="colgroup"
                    colSpan={2 + METHODS.length}
                    className="text-left p-3 px-4 font-display uppercase tracking-widest text-xs"
                  >
                    {g}
                  </th>
                </tr>
                {BRANDING_LINES.filter((l) => l.group === g).map((l) => (
                  <tr key={l.product} className="border-t border-line">
                    <th scope="row" className="text-left font-medium p-4">{l.product}</th>
                    <td className="text-right p-4 text-ash tabular-nums">{l.sizes}</td>
                    {METHODS.map((m) => {
                      const fee = l.fees[m];
                      return (
                        <td key={m} className="text-right p-4 tabular-nums">
                          {fee === undefined ? (
                            <span className="text-ash" aria-label="Not available">–</span>
                          ) : (
                            <>
                              <span className="font-semibold">{formatAud(fee)}</span>
                              <span className="block text-xs text-ash">{formatAud(incGst(fee))} inc</span>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="mt-4 text-xs text-ash leading-relaxed max-w-3xl">
          Setup fees cover tooling only; equipment is priced in your buying-group catalogue. Fees are a
          guide and are confirmed on your quote. Branded turf, racks and other items are quoted on
          request.
        </p>
      </section>

      {/* How branding is charged */}
      <section className="bg-smoke">
        <div className="container-mk py-20">
          <div className="max-w-2xl mb-14">
            <Eyebrow className="mb-4">How Branding Is Charged</Eyebrow>
            <h2 className="text-3xl lg:text-4xl font-bold">The more you buy, the less you pay upfront</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-px bg-line">
            {brandingTerms.map((t) => (
              <div key={t.title} className="bg-white p-8">
                <h3 className="text-lg font-bold">{t.title}</h3>
                <p className="mt-3 text-ash leading-relaxed text-sm">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-mk py-20 max-w-3xl">
        <Eyebrow className="mb-4">FAQ</Eyebrow>
        <h2 className="text-3xl font-bold mb-10">Questions gym owners ask first</h2>
        <AccordionSections sections={faqs} />
        <p className="mt-8 text-ash leading-relaxed">
          Planning a bigger change than new equipment? See our{" "}
          <Link href="/fitout-solution" className="underline decoration-accent-600 underline-offset-2">
            gym fitout service
          </Link>
          .
        </p>
      </section>

      {/* Join */}
      <section id="join" className="bg-smoke scroll-mt-24">
        <div className="container-mk py-20 grid lg:grid-cols-[1fr_1.4fr] gap-14">
          <div>
            <Eyebrow className="mb-4">Join</Eyebrow>
            <h2 className="text-3xl lg:text-4xl font-bold">Join the buying group</h2>
            <div className="mt-6 space-y-4 text-ash leading-relaxed">
              <p>
                Tell us about your gym and what you&apos;re looking to buy. We&apos;ll come back with
                your personalised catalogue and buying-group pricing.
              </p>
              <p className="text-sm">
                Interested in branding? Mention which products and sizes and we&apos;ll include setup
                fees in your quote.
              </p>
            </div>
          </div>
          <div className="bg-white p-5 sm:p-8 border border-line">
            <ContactForm
              defaultTopic={ENQUIRY_KIND.equipment}
              messagePlaceholder="Tell us about your gym and what you're looking to buy"
              submitLabel="Join the Buying Group"
            />
          </div>
        </div>
      </section>
    </>
  );
}
