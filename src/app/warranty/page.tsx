import type { Metadata } from "next";
import ContentPage from "@/components/marketing/ContentPage";
import WarrantyClaimForm from "@/components/marketing/WarrantyClaimForm";
import Eyebrow from "@/components/ui/Eyebrow";
import { contentPages } from "@/lib/content-pages";

const data = contentPages["warranty"];

export const metadata: Metadata = {
  title: `${data.title}`,
  description: data.subtitle,
};

export default function Page() {
  return (
    <>
      <ContentPage {...data} collapsible />
      {/* The terms told people what was covered but gave them no way to act on
          it: the page had no claim form and no address to send one to. */}
      <section id="claim" className="border-t border-line bg-smoke">
        <div className="container-mk max-w-3xl py-16">
          <Eyebrow className="mb-4">Make a claim</Eyebrow>
          <h2 className="font-display text-3xl lg:text-4xl uppercase leading-[0.95]">
            Lodge a warranty claim
          </h2>
          <p className="mt-5 text-ash leading-relaxed">
            Tell us what has failed and we will assess it against the terms above. The more detail
            you can give about how the equipment is used, the faster we can resolve it.
          </p>
          <div className="mt-8">
            <WarrantyClaimForm />
          </div>
        </div>
      </section>
    </>
  );
}
