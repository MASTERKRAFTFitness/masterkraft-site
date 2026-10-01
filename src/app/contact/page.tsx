import Link from "next/link";
import type { Metadata } from "next";
import PageHero from "@/components/marketing/PageHero";
import ContactForm from "@/components/marketing/ContactForm";
import Eyebrow from "@/components/ui/Eyebrow";
import { portalLoginHref } from "@/lib/site";

// THE CONTACT PAGE, and the customer service channel: orders, delivery,
// returns and anything else after the sale come in through this form. The
// nav's "Contact", the footer's "Contact us", "can't find
// what you're looking for" on search, the enquire button on an out-of-stock
// product. None of those are fitout links, and someone with a one-line question
// about a barbell will not fill in a five-step fitout brief - that wizard lives
// at /fitout-solution, behind the header's "Fitout Solution" button.
//
// So this is deliberately the plain version: seven fields, no wizard, no pitch.

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Contact MasterKraft customer service about an order, delivery or return, or ask about equipment, wholesale access or distribution. A person reads every message.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact Us"
        title="Ask us anything"
        subtitle="Customer service for an order, a delivery or a return, plus equipment, wholesale access, or something we have not thought of. Send it here and a person reads it."
        breadcrumbs={[{ name: "Contact", href: "/contact" }]}
      />

      <section className="container-mk py-20 grid lg:grid-cols-[1.4fr_1fr] gap-16">
        <div>
          <Eyebrow className="mb-6">Send an Enquiry</Eyebrow>
          <ContactForm />
        </div>

        <aside className="space-y-8">
          {/* First, because a fitout enquiry sent through this form gets a
              slower, worse answer than the brief wizard would give it. */}
          <div>
            <h2 className="font-mono text-xs tracking-widest text-accent-600 uppercase">
              Planning a fitout?
            </h2>
            <p className="mt-2 text-ash leading-relaxed">
              Send the{" "}
              <Link
                href="/fitout-solution"
                className="underline decoration-accent-600 underline-offset-2"
              >
                fitout brief
              </Link>{" "}
              instead - about ninety seconds, and it comes back with a 3D concept and an
              indicative price within one business day.
            </p>
          </div>
          <div>
            <h2 className="font-mono text-xs tracking-widest text-accent-600 uppercase">Phone</h2>
            <a
              href="tel:+61390449575"
              className="mt-2 block text-lg hover:text-accent-600 transition-colors"
            >
              +61 3 9044 9575
            </a>
            <p className="mt-2 text-ash text-sm leading-relaxed">Melbourne hours.</p>
          </div>
          <div>
            <h2 className="font-mono text-xs tracking-widest text-accent-600 uppercase">
              Wholesale &amp; Distribution
            </h2>
            <p className="mt-2 text-ash leading-relaxed">
              Existing partners can sign in to the{" "}
              <a
                href={portalLoginHref}
                className="underline decoration-accent-600 underline-offset-2"
              >
                portal
              </a>
              . New partners - see{" "}
              <Link
                href="/distributor"
                className="underline decoration-accent-600 underline-offset-2"
              >
                Become a Distributor
              </Link>
              .
            </p>
          </div>
          <div>
            <h2 className="font-mono text-xs tracking-widest text-accent-600 uppercase">
              Warranty
            </h2>
            <p className="mt-2 text-ash leading-relaxed">
              Something not right? Lodge it on the{" "}
              <Link href="/warranty" className="underline decoration-accent-600 underline-offset-2">
                warranty page
              </Link>{" "}
              so it goes straight to the service team rather than through this form.
            </p>
          </div>
        </aside>
      </section>
    </>
  );
}
