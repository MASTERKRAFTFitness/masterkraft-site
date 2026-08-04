import type { Metadata } from "next";
import PageHero from "@/components/marketing/PageHero";
import HubspotForm from "@/components/marketing/HubspotForm";
import Eyebrow from "@/components/ui/Eyebrow";

export const metadata: Metadata = {
  title: "Delivery Information",
  description:
    "Booked an order with MasterKraft? Complete the delivery information form so we can plan site access and schedule your delivery.",
};

// Public HubSpot form (region AP1). GUID is not secret (it ships in the client
// embed), so an env override falls back to the known form id.
const DELIVERY_FORM_ID =
  process.env.NEXT_PUBLIC_HUBSPOT_FORM_DELIVERY || "7d9f4fa6-561d-4443-b228-5fef0c1ad619";
const SHARE_URL = "https://7bkjvr.share-ap1.hsforms.com/2fZ9PplYdREOyKF_vDBrWGQ";

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
        subtitle="Tell us about your site so we can plan access and schedule your delivery."
      />

      <section className="container-mk py-16 grid lg:grid-cols-[1fr_1.6fr] gap-14 items-start">
        <aside className="lg:sticky lg:top-28 space-y-8">
          <div>
            <Eyebrow className="mb-4">Before you start</Eyebrow>
            <p className="text-ash leading-relaxed">
              Once your order is confirmed, this form gives our logistics team everything they need to
              get large equipment safely into your space. The more detail you provide, the smoother the
              delivery.
            </p>
          </div>
          <div>
            <h2 className="font-mono text-xs tracking-widest text-accent uppercase mb-4">
              What you&apos;ll need
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
              Not sure about something? Call{" "}
              <a href="tel:+61390449575" className="underline decoration-accent-600 underline-offset-2">
                03 9044 9575
              </a>{" "}
              or{" "}
              <a href="/contact" className="underline decoration-accent-600 underline-offset-2">
                get in touch
              </a>{" "}
              and our team will help.
            </p>
          </div>
        </aside>

        <div>
          <HubspotForm formId={DELIVERY_FORM_ID} hostedUrl={SHARE_URL} />
        </div>
      </section>
    </>
  );
}
