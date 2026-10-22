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
  CLUB_DISCOUNT,
  CLUB_RUNS,
  FEE_SHARE,
  LEAD_TIME_WEEKS,
  METHODS_IN_USE,
  METHOD_LABEL,
  METHOD_NOTE,
  TRADE_DISCOUNT,
  formatAud,
  fullRangeFee,
  incGst,
} from "@/lib/custom-branding";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const metadata: Metadata = {
  title: "Independent Gyms | Buying Club Pricing & Custom Branded Equipment",
  description:
    "Trade pricing for independent gyms, a further discount when you order in a quarterly Buying Club run, and custom branded plates, dumbbells, kettlebells and balls with a once-off fee per size.",
  alternates: { canonical: "/independent-gyms" },
};

const benefits = [
  [
    "Buying Club pricing",
    `Your trade login takes ${pct(TRADE_DISCOUNT)} off the website price on every order. Order in a Buying Club run and it's ${pct(CLUB_DISCOUNT)} off.`,
  ],
  [
    "Your own catalogue",
    "Every member gets a personalised catalogue with tiered pricing, built around your floor and your members rather than a generic price list.",
  ],
  [
    "Quarterly ordering",
    "Four Buying Club runs a year, each with a fixed cut-off, so you can budget ahead and replace worn kit before it becomes a problem.",
  ],
  [
    "Your brand on the floor",
    "Put your logo on the equipment your members touch every day: plates, dumbbells, kettlebells and balls.",
  ],
];

const steps = [
  { n: "01", title: "Join", body: "Tell us about your gym. It takes two minutes." },
  { n: "02", title: "Welcome", body: "We'll be in touch to understand your floor, your members and what you buy through the year." },
  { n: "03", title: "Your catalogue", body: "We set up your trade login and a personalised catalogue for your gym." },
  { n: "04", title: "Join a run", body: "Confirm your order by a Buying Club cut-off, add branding if you want it, and it ships with that production run." },
];

// Steve's 13 Oct fee rule, as the sales sheet states it, from the lowest tier up.
const brandingTerms = [...FEE_SHARE].reverse().map((t, i, all) => {
  const next = all[i + 1];
  if (t.weCover === 0)
    return {
      title: `Orders up to ${formatAud(next?.over ?? 0)}`,
      body: "You pay 100%. Standard branding fees as above.",
    };
  if (t.weCover === 1)
    return {
      title: `Orders over ${formatAud(t.over)}`,
      body: "We pay 100%. Branding is on us: your logo, no set-up cost.",
    };
  return {
    title: `Orders over ${formatAud(t.over)}`,
    body: `We pay ${pct(t.weCover)}. MasterKraft covers half of your branding fees.`,
  };
});

// The sales sheet's worked example: five sizes of laser-branded comp bumpers.
const example = BRANDING_LINES.find((l) => l.product.startsWith("Competition bumper"))!;
const examplePlates = example.sizes * 8;

const faqs = [
  {
    heading: "Who can join the Buying Club?",
    body: [
      "Any independently owned gym, studio or training facility in Australia, from a single PT studio to a multi-site operator that isn't part of a franchise network.",
    ],
  },
  {
    heading: "Are the branding fees per item?",
    body: [
      "No. Each fee is a once-off set-up per size, per design. Once it is done, every unit you order in that size, now or on any reorder, carries your logo at no extra cost. A new logo or a design change is a new set-up.",
      `For example, laser branding all ${example.sizes} sizes of our competition bumpers is ${formatAud(
        fullRangeFee(example)
      )} ex GST, once. Across ${examplePlates} plates that is ${formatAud(
        fullRangeFee(example) / examplePlates
      )} a plate, half that on an order over $20,000, and nothing on an order over $50,000.`,
    ],
  },
  {
    heading: "When does my order arrive?",
    body: [
      `Branded kit is made to order: allow ${LEAD_TIME_WEEKS} weeks. Unbranded stock ships on normal lead times. Buying Club orders ship with the production run for the cut-off they were confirmed by.`,
    ],
  },
  {
    heading: "Are the prices ex GST?",
    body: [
      "Yes. The table shows each set-up fee ex GST, with the GST-inclusive figure underneath. The $20,000 and $50,000 thresholds are the product value of a single order, ex GST. Equipment is priced separately in your catalogue.",
    ],
  },
  {
    heading: "Which branding method should I choose?",
    body: [
      "Each range is branded the way that suits it: laser engraving on plates, PVC labels on urethane dumbbells, barbells and kettlebells, printing on balls, and a moulded logo on rubber hex dumbbells. Moulded branding on other plates, bumpers, barbells, kettlebells and steps is available on request.",
    ],
  },
  {
    heading: "Can I brand only some sizes?",
    body: [
      "Yes. Fees are charged per size, so you can brand only the sizes you buy, such as your working-weight dumbbells, and keep the rest in MasterKraft branding.",
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

export default function IndependentGymsPage() {
  return (
    <>
      <JsonLd data={faqJsonLd} />
      <PageHero
        eyebrow="Independent Gyms"
        title="Buying power for independent gyms"
        subtitle="Join the MasterKraft Buying Club for better pricing on commercial equipment, and put your own brand on the floor."
        image="/home/hero-2.jpg"
        breadcrumbs={[{ name: "Independent Gyms", href: "/independent-gyms" }]}
      />

      {/* Intro */}
      <section className="container-mk py-20 grid lg:grid-cols-[1fr_1.2fr] gap-14">
        <div>
          <Eyebrow className="mb-4">The Buying Club</Eyebrow>
          <h2 className="text-3xl lg:text-4xl font-bold">Buy together. Pay less.</h2>
          <a href="#join" className="btn btn-accent mt-8">
            Join the Buying Club <span aria-hidden>→</span>
          </a>
        </div>
        <div className="space-y-4 text-ash leading-relaxed">
          <p>
            Franchise networks get better equipment prices because they buy together. Independent gyms
            have always paid more for the same kit, simply because they buy alone.
          </p>
          <p>
            The MasterKraft Buying Club changes that. Your trade login takes {pct(TRADE_DISCOUNT)} off
            the website price on every order. Join a Buying Club run and we pool your order with other
            independent gyms and send it to manufacture together, taking you to {pct(CLUB_DISCOUNT)}{" "}
            off the commercial-grade equipment we already supply to networks across Australia.
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

      {/* Buying Club runs */}
      <section id="runs" className="container-mk py-20 scroll-mt-24">
        <div className="max-w-2xl mb-10">
          <Eyebrow className="mb-4">Buying Club Runs</Eyebrow>
          <h2 className="text-3xl lg:text-4xl font-bold">Order by {CLUB_RUNS[0].cutoff.replace(/^Fri /, "").replace(/ \d{4}$/, "")}</h2>
          <p className="mt-4 text-ash leading-relaxed">
            Orders confirmed by a cut-off get Buying Club pricing and ship with that production run.
            For example, a 20kg competition bumper at {formatAud(225)} on the website is{" "}
            {formatAud(225 * (1 - TRADE_DISCOUNT))} on your trade login and{" "}
            {formatAud(225 * (1 - CLUB_DISCOUNT))} in a Buying Club run, inc GST.
          </p>
        </div>
        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line">
          {CLUB_RUNS.map((r) => (
            <li key={r.cutoff} className="bg-white p-6">
              <p className="text-xs text-ash uppercase tracking-widest">Cut-off</p>
              <p className="mt-1 text-lg font-bold">{r.cutoff}</p>
              <p className="mt-2 text-sm text-ash">Delivered {r.delivered}</p>
            </li>
          ))}
        </ol>
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
          <h2 className="text-3xl lg:text-4xl font-bold">Your logo. On every plate.</h2>
          <p className="mt-4 text-ash leading-relaxed">
            You pay once per size. Every reorder after that carries your brand at no extra cost.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {METHODS_IN_USE.map((m) => (
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
          <h2 className="text-2xl lg:text-3xl font-bold">One fee per size. That&apos;s it.</h2>
          <p className="mt-3 text-ash text-sm leading-relaxed">
            Choose the ranges you want branded. Each size is a once-off set-up. Product is priced as
            normal; branding is the only extra. AUD ex GST, inc GST underneath.
          </p>
        </div>
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Custom branding set-up fees per size, by range</caption>
            <thead className="bg-ink text-white">
              <tr>
                <th scope="col" className="text-left font-semibold p-4">Range</th>
                <th scope="col" className="text-left font-semibold p-4">Method</th>
                <th scope="col" className="text-right font-semibold p-4">Fee per size</th>
                <th scope="col" className="text-right font-semibold p-4">Sizes</th>
                <th scope="col" className="text-right font-semibold p-4">Brand the full range</th>
              </tr>
            </thead>
            <tbody>
              {BRANDING_LINES.map((l) => (
                <tr key={l.product} className="border-t border-line">
                  <th scope="row" className="text-left font-medium p-4">{l.product}</th>
                  <td className="p-4 text-ash">{METHOD_LABEL[l.method]}</td>
                  <td className="text-right p-4 tabular-nums">
                    <span className="font-semibold">{formatAud(l.fee)}</span>
                    <span className="block text-xs text-ash">{formatAud(incGst(l.fee))} inc</span>
                  </td>
                  <td className="text-right p-4 text-ash tabular-nums">{l.sizes}</td>
                  <td className="text-right p-4 tabular-nums">
                    <span className="font-semibold">{formatAud(fullRangeFee(l))}</span>
                    <span className="block text-xs text-ash">{formatAud(incGst(fullRangeFee(l)))} inc</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-ash leading-relaxed max-w-3xl">
          Brand only the sizes you buy; you don&apos;t have to do the full range. Fees are once-off per
          size, per design; a new logo or design change is a new set-up. Moulded branding on other
          plates, bumpers, barbells, kettlebells and steps is available on request. Allow{" "}
          {LEAD_TIME_WEEKS} weeks for branded items. Prices current October 2026 and subject to change.
        </p>
      </section>

      {/* How branding is charged */}
      <section className="bg-smoke">
        <div className="container-mk py-20">
          <div className="max-w-2xl mb-14">
            <Eyebrow className="mb-4">How Branding Is Charged</Eyebrow>
            <h2 className="text-3xl lg:text-4xl font-bold">Spend more, we pay more</h2>
            <p className="mt-4 text-ash leading-relaxed">
              Based on the product value of a single order, ex GST.
            </p>
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
            <h2 className="text-3xl lg:text-4xl font-bold">Join the Buying Club</h2>
            <div className="mt-6 space-y-4 text-ash leading-relaxed">
              <p>
                Tell us about your gym and what you&apos;re looking to buy. We&apos;ll come back with
                your trade login, your personalised catalogue and the next Buying Club cut-off.
              </p>
              <p className="text-sm">
                Interested in branding? Mention which ranges and sizes and we&apos;ll show your logo on
                each product before anything is made.
              </p>
            </div>
          </div>
          <div className="bg-white p-5 sm:p-8 border border-line">
            <ContactForm
              defaultTopic={ENQUIRY_KIND.equipment}
              messagePlaceholder="Tell us about your gym and what you're looking to buy"
              submitLabel="Join the Buying Club"
            />
          </div>
        </div>
      </section>
    </>
  );
}
