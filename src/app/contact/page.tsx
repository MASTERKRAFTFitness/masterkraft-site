import Link from "next/link";
import type { Metadata } from "next";
import PageHero from "@/components/marketing/PageHero";
import ContactForm from "@/components/marketing/ContactForm";
import Eyebrow from "@/components/ui/Eyebrow";
import { portalLoginHref } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with MasterKraft about equipment, fitouts, wholesale and distribution. Engineered for Fitness.",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Let's build your space"
        subtitle="Whether it's a single piece of equipment or a full multi-site fit-out, tell us what you need and we'll tailor a solution around you."
      />

      <section className="container-mk py-20 grid lg:grid-cols-[1.4fr_1fr] gap-16">
        <div>
          <Eyebrow className="mb-6">Send an Enquiry</Eyebrow>
          <ContactForm />
        </div>

        <aside className="space-y-8">
          <div>
            <h3 className="font-mono text-xs tracking-widest text-accent-600 uppercase">Phone</h3>
            <a href="tel:+61390449575" className="mt-2 block text-lg hover:text-accent-600 transition-colors">
              +61 3 9044 9575
            </a>
          </div>
          <div>
            <h3 className="font-mono text-xs tracking-widest text-accent-600 uppercase">Wholesale & Distribution</h3>
            <p className="mt-2 text-ash leading-relaxed">
              Existing partners can sign in to the{" "}
              <a href={portalLoginHref} className="underline decoration-accent-600 underline-offset-2">
                portal
              </a>
              . New partners - see{" "}
              <Link href="/distributor" className="underline decoration-accent-600 underline-offset-2">
                Become a Distributor
              </Link>
              .
            </p>
          </div>
        </aside>
      </section>
    </>
  );
}
