import Link from "next/link";
import type { Metadata } from "next";
import PageHero from "@/components/marketing/PageHero";
import ContactForm from "@/components/marketing/ContactForm";
import Eyebrow from "@/components/ui/Eyebrow";
import { portalLoginHref } from "@/lib/site";

// /contact is the fitout landing page now - a five-step brief wizard aimed at
// one job. That left every other kind of enquiry without a form. The links that
// feed this page are not fitout links: "can't find what you're looking for" on
// search, the enquire button on an out-of-stock product, the footer's Contact
// Us. Someone with a one-line question about a barbell will not fill in a
// fitout brief, and until this page existed the only thing left for them was a
// phone number on Melbourne hours.
//
// So this is deliberately the plain version: seven fields, no wizard, no pitch.

export const metadata: Metadata = {
  title: "General Enquiry",
  description:
    "Ask MasterKraft about equipment, an existing order, wholesale access or distribution. Tell us what you need and a person comes back to you.",
  alternates: { canonical: "/contact/enquiry" },
};

export default function EnquiryPage() {
  return (
    <>
      <PageHero
        eyebrow="General Enquiry"
        title="Ask us anything"
        subtitle="Equipment, an order already in flight, wholesale access, or something we have not thought of. Send it here and a person reads it."
        breadcrumbs={[
          { name: "Contact", href: "/contact" },
          { name: "General Enquiry", href: "/contact/enquiry" },
        ]}
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
              <Link href="/contact" className="underline decoration-accent-600 underline-offset-2">
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
