import type { Metadata } from "next";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";

export const metadata: Metadata = {
  title: "Delivery Information",
  description:
    "How MasterKraft plans site access and schedules delivery of your equipment.",
};

const NEEDS = [
  "Your sales order number and site details",
  "Studio open date and the delivery date you need",
  "Site access: truck access, loading dock, stairs, lifts and doorway sizes",
  "At least one photo showing delivery access to your equipment room",
];

export default function DeliveryInformationPage() {
  return (
    <>
      <PageHero
        eyebrow="Support"
        title="Delivery Information"
        subtitle="How we plan site access and schedule delivery of your equipment."
      />

      <section className="container-mk max-w-3xl py-16 space-y-10">
        <div>
          <Eyebrow className="mb-4">Before your delivery</Eyebrow>
          <p className="text-ash leading-relaxed">
            Once your order is confirmed, our logistics team coordinates getting large equipment safely
            into your space. The more detail you can share about your site up front, the smoother the
            delivery.
          </p>
        </div>

        <div>
          <h2 className="font-mono text-xs tracking-widest text-accent uppercase mb-4">
            What we&apos;ll need from you
          </h2>
          <ul className="space-y-3">
            {NEEDS.map((item) => (
              <li key={item} className="flex gap-3 text-ash leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-accent" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-line pt-6">
          <p className="text-sm text-ash">
            Ready to book a delivery, or have a question? Call{" "}
            <a href="tel:+61390449575" className="underline decoration-accent-600 underline-offset-2">
              +61 3 9044 9575
            </a>{" "}
            or{" "}
            <a href="/contact" className="underline decoration-accent-600 underline-offset-2">
              get in touch
            </a>{" "}
            and our team will help.
          </p>
        </div>
      </section>
    </>
  );
}
