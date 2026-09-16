import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import Eyebrow from "@/components/ui/Eyebrow";
import JsonLd from "@/components/seo/JsonLd";
import StatsBand from "@/components/marketing/StatsBand";
import RevlFeature from "@/components/marketing/RevlFeature";
import FitoutBriefForm from "@/components/marketing/FitoutBriefForm";
import { heroAlt } from "@/lib/image-alt";
import { fitouts } from "@/lib/fitouts";
import { SITE_URL, portalLoginHref } from "@/lib/site";

// THIS IS THE FIT-OUT LANDING PAGE, not a generic contact page.
//
// The header's primary CTA ("Fit-Out Solution →", desktop and mobile) points
// here, as does the homepage hero's second button and every "get in touch" on the
// fit-out and city pages. It is the site's main conversion surface, and it used to
// be a hero, a seven-field form and a phone number - no proof, no scope, no answer
// to "what happens after I press send".
//
// So: the brief wizard sits IN the hero, beside the pitch rather than below it,
// because scrolling to find the form is where a paid click leaks. Everything under
// it exists to answer an objection someone who did not convert on the first screen
// is having - what it costs, how long it takes, whether we have done it before,
// whether they are too small to bother us.
//
// Other enquiry routes (wholesale, distribution, warranty) are kept at the bottom
// rather than dropped: the footer's "Contact us" link lands here too.

export const metadata: Metadata = {
  title: "Gym Fit-Out Enquiry | Free 3D Design & Quote",
  description:
    "Tell us about your space and our design team comes back within one business day with a 3D concept and an indicative price. Commercial gyms, boutique studios, PT and home setups.",
  alternates: { canonical: "/contact" },
};

const heroProof = [
  ["229 sites fitted out", "Across 12 countries, in gyms, clinics and studios"],
  ["One accountable partner", "Design, supply, freight, install and warranty"],
  ["Reply in one business day", "A real person reads your brief, not an auto-responder"],
];

const scope = [
  {
    title: "Space planning & 3D design",
    body: "We lay your floor out around the dimensions and obstacles you give us, and show you the space before anything is built.",
  },
  {
    title: "The whole equipment list",
    body: "Rigs, racks, platforms, strength, cardio, free weights, functional and conditioning - specified as one coherent floor, not a shopping list.",
  },
  {
    title: "Flooring & storage",
    body: "Rubber, turf and sled tracks, plus the storage that keeps the floor usable once the equipment lands.",
  },
  {
    title: "Custom branding",
    body: "In-house engineers finish equipment in your colourways with your logo - the same way Fernwood's network is produced.",
  },
  {
    title: "Freight & installation",
    body: "Coordinated as a single container to your door, staged to your build schedule rather than ours.",
  },
  {
    title: "Warranty & service",
    body: "A 72-hour response SLA in writing, and one number to call for every site in your group.",
  },
];

const process = [
  {
    n: "01",
    title: "You send the brief",
    body: "Five steps, about ninety seconds. A phone photo of a sketch is enough to start.",
  },
  {
    n: "02",
    title: "We design and price it",
    body: "Within one business day you get a concept for the space and an indicative price - no obligation, no deposit.",
  },
  {
    n: "03",
    title: "We refine it with you",
    body: "Adjust the layout, the spec or the staging until the floor and the number both work.",
  },
  {
    n: "04",
    title: "We build, ship and install",
    body: "Manufacture, quality control, freight and install, coordinated to your opening date.",
  },
];

const faqs = [
  {
    q: "How much does a gym fit-out cost?",
    a: "It depends on the floor area and the spec, which is why the brief asks for a budget band rather than a figure. As a guide, a PT studio or home setup usually lands under $50k, a boutique studio between $50k and $150k, and a full commercial floor above that. You get an indicative price with your concept, before any commitment.",
  },
  {
    q: "Is the 3D design really free?",
    a: "Yes. There is no charge and no deposit for the concept and the indicative price. We do it because a fit-out is a considered purchase and a layout you can see is the fastest way to know whether we are the right partner.",
  },
  {
    q: "How long does a fit-out take?",
    a: "Typically eight to fourteen weeks from an approved design to an installed floor, depending on how much is custom-branded and where you are. We stage delivery to your build schedule, so a construction delay does not leave equipment sitting in a car park.",
  },
  {
    q: "Do you take on small projects?",
    a: "Yes - home gyms and single-zone upgrades go through the same brief as a multi-site group. A small fit-out done properly is how a lot of our commercial relationships started.",
  },
  {
    q: "What if I do not have a floor plan?",
    a: "Not a problem. A smartphone photo of a hand-drawn sketch with the wall lengths on it is genuinely enough to produce a first concept, and we confirm everything at site measure.",
  },
  {
    q: "Do you deliver outside Australia?",
    a: "Yes. We are warehoused near our markets and have delivered fit-outs across 12 countries, including Singapore and New Zealand. Give us your postcode or city in the brief and we cost freight and installation to your site.",
  },
  {
    q: "Can you match our existing equipment and branding?",
    a: "Usually, yes. Our engineers customise equipment and finishes in-house, so a new site can be specified to match the floors you already run and produced in your brand colours.",
  },
];

export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          serviceType: "Gym fit-out design, supply and installation",
          name: "MasterKraft Gym Fit-Outs",
          description: metadata.description,
          areaServed: { "@type": "Place", name: "Australia and international" },
          provider: {
            "@type": "Organization",
            name: "MasterKraft",
            url: SITE_URL,
            telephone: "+61390449575",
          },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />

      {/* HERO + BRIEF. The form is above the fold on desktop on purpose. */}
      <section id="brief" className="relative bg-carbon text-white overflow-hidden">
        <Image
          src="/revl/wide-studio.jpg"
          alt={heroAlt("/revl/wide-studio.jpg") ?? ""}
          fill
          className="object-cover opacity-25"
          style={{ objectPosition: "center 40%" }}
          sizes="100vw"
          // Next 16 deprecated `priority` in favour of `preload`. This is the LCP
          // element on the page, so it is preloaded from the <head>.
          preload
        />
        <div className="absolute inset-0 bg-gradient-to-b from-carbon/85 via-carbon/75 to-carbon" />

        {/* Three children, explicitly placed. On a phone they stack headline →
            FORM → proof, so the thing a visitor came to do is one screen down
            rather than below the full pitch. On desktop the grid puts the
            headline and the proof back in one column beside the form. */}
        <div className="relative container-mk pt-28 lg:pt-36 pb-20 grid lg:grid-cols-[1fr_1.15fr] lg:grid-rows-[auto_1fr] gap-x-12 lg:gap-x-16 gap-y-10 items-start">
          <div className="lg:col-start-1 lg:row-start-1">
            <Eyebrow tone="dark" className="mb-5">
              Fit-Out Solution
            </Eyebrow>
            <h1 className="text-4xl lg:text-6xl font-bold leading-[1.05]">
              Get a 3D design of your gym, free
            </h1>
            <p className="mt-6 text-white/75 text-lg leading-relaxed max-w-xl">
              Tell us about your space and our design team lays it out, specifies the
              equipment and prices it - back to you within one business day. No deposit, no
              obligation.
            </p>
          </div>

          {/* The wizard renders on a white card, so it reads as the one thing on
              this screen you are meant to touch. */}
          <div className="text-ink lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <FitoutBriefForm />
          </div>

          <div className="lg:col-start-1 lg:row-start-2">
            <ul className="space-y-5">
              {heroProof.map(([title, body]) => (
                <li key={title} className="flex gap-4">
                  <span className="mt-2 h-2.5 w-2.5 shrink-0 bg-accent" aria-hidden />
                  <span>
                    <span className="block font-display uppercase tracking-wide">{title}</span>
                    <span className="block mt-1 text-white/60 text-sm leading-relaxed">
                      {body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-8 text-white/60 text-sm">
              Would rather talk it through?{" "}
              <a
                href="tel:+61390449575"
                className="text-accent-300 underline decoration-accent underline-offset-4 hover:text-white transition-colors"
              >
                +61 3 9044 9575
              </a>
            </p>
          </div>
        </div>
      </section>

      <StatsBand />

      {/* SCOPE - what "fit-out" actually covers here */}
      <section className="container-mk py-20">
        <div className="max-w-2xl mb-14">
          <Eyebrow className="mb-4">What You Get</Eyebrow>
          <h2 className="text-3xl lg:text-4xl font-bold">One scope, one accountable partner</h2>
          <p className="mt-4 text-ash leading-relaxed">
            Every part of a fit-out sits with us, so there is nobody to chase and nothing
            that falls between two suppliers.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line">
          {scope.map((s) => (
            <div key={s.title} className="bg-white p-8">
              <h3 className="text-lg font-bold">{s.title}</h3>
              <p className="mt-3 text-ash text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PROCESS - answers "what happens after I press send" */}
      <section className="bg-smoke border-y border-line">
        <div className="container-mk py-20">
          <div className="max-w-2xl mb-14">
            <Eyebrow className="mb-4">What Happens Next</Eyebrow>
            <h2 className="text-3xl lg:text-4xl font-bold">From brief to installed floor</h2>
          </div>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {process.map((p) => (
              <li key={p.n}>
                <span className="font-mono text-sm tracking-widest text-accent-600">{p.n}</span>
                <span className="mt-3 block h-px w-full bg-line" aria-hidden />
                <h3 className="mt-4 text-lg font-bold">{p.title}</h3>
                <p className="mt-2 text-ash text-sm leading-relaxed">{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* PROOF - a real network we fitted out end to end */}
      <RevlFeature />

      {/* TYPES - for anyone who wants to read before they enquire */}
      <section className="container-mk py-20">
        <div className="max-w-2xl mb-12">
          <Eyebrow className="mb-4">Markets We Serve</Eyebrow>
          <h2 className="text-3xl lg:text-4xl font-bold">Not sure where you fit?</h2>
          <p className="mt-4 text-ash leading-relaxed">
            Read how we approach your kind of space, then come back and send the brief.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {fitouts.map((f) => (
            <Link
              key={f.slug}
              href={`/fitout/${f.slug}`}
              className="group relative aspect-[5/3] overflow-hidden bg-carbon"
            >
              <Image
                src={f.image}
                alt={f.name}
                fill
                className="object-cover opacity-55 transition-all duration-500 group-hover:opacity-80 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <h3 className="text-white text-lg font-bold group-hover:text-accent transition-colors">
                  {f.name}
                </h3>
                <p className="mt-1.5 text-white/70 text-sm leading-relaxed">{f.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* FAQ - the objections that stop a brief being sent */}
      <section className="bg-smoke border-y border-line">
        <div className="container-mk py-20 grid lg:grid-cols-[1fr_1.6fr] gap-14">
          <div className="lg:sticky lg:top-28 self-start">
            <Eyebrow className="mb-4">Before You Ask</Eyebrow>
            <h2 className="text-3xl lg:text-4xl font-bold">Fit-out questions</h2>
            <Link href="#brief" className="btn btn-accent mt-8">
              Send your brief <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="divide-y divide-line">
            {faqs.map((f) => (
              <div key={f.q} className="py-6 first:pt-0">
                <h3 className="text-lg font-bold">{f.q}</h3>
                <p className="mt-2 text-ash leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EVERYTHING ELSE. The footer's "Contact us" lands on this page too, so the
          non-fit-out routes have to stay reachable. */}
      <section className="container-mk py-20">
        <div className="max-w-2xl mb-12">
          <Eyebrow className="mb-4">Other Enquiries</Eyebrow>
          <h2 className="text-3xl lg:text-4xl font-bold">Not a fit-out?</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line">
          <div className="bg-white p-8">
            <h3 className="font-mono text-xs tracking-widest text-accent-600 uppercase">
              Phone
            </h3>
            <a
              href="tel:+61390449575"
              className="mt-3 block text-lg hover:text-accent-600 transition-colors"
            >
              +61 3 9044 9575
            </a>
            <p className="mt-2 text-ash text-sm leading-relaxed">
              Melbourne hours, and the fastest way to reach a person.
            </p>
          </div>
          <div className="bg-white p-8">
            <h3 className="font-mono text-xs tracking-widest text-accent-600 uppercase">
              Wholesale & Portal
            </h3>
            <p className="mt-3 text-ash text-sm leading-relaxed">
              Existing partners can sign in to the{" "}
              <a
                href={portalLoginHref}
                className="text-ink underline decoration-accent-600 underline-offset-2"
              >
                portal
              </a>{" "}
              to order and track every site in one place.
            </p>
          </div>
          <div className="bg-white p-8">
            <h3 className="font-mono text-xs tracking-widest text-accent-600 uppercase">
              Distribution
            </h3>
            <p className="mt-3 text-ash text-sm leading-relaxed">
              New partners - see{" "}
              <Link
                href="/distributor"
                className="text-ink underline decoration-accent-600 underline-offset-2"
              >
                Become a Distributor
              </Link>
              .
            </p>
          </div>
          <div className="bg-white p-8">
            <h3 className="font-mono text-xs tracking-widest text-accent-600 uppercase">
              Warranty
            </h3>
            <p className="mt-3 text-ash text-sm leading-relaxed">
              Something not right? Lodge it on the{" "}
              <Link
                href="/warranty"
                className="text-ink underline decoration-accent-600 underline-offset-2"
              >
                warranty page
              </Link>{" "}
              and it goes straight to our service team.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
