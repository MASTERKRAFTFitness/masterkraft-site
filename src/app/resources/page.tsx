import type { Metadata } from "next";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
import ResourcesList, { type ResourceProduct } from "@/components/marketing/ResourcesList";
import docs from "@/lib/resource-docs.json";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Product manuals, installation guides and technical documents for MasterKraft equipment.",
};

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Guides & Product Manuals"
        subtitle="Need help to assemble your equipment or get the most out of your products? Find installation guides and product manuals here."
      />

      <section className="container-mk py-16">
        <Eyebrow className="mb-10">Product Manuals & Guides</Eyebrow>
        <ResourcesList products={docs as ResourceProduct[]} />

        <p className="mt-12 text-ash text-sm max-w-3xl">
          Can&apos;t find a manual for your product?{" "}
          <a href="/contact" className="underline decoration-accent-600 underline-offset-2">
            Contact us
          </a>{" "}
          and we&apos;ll send it through.
        </p>
      </section>
    </>
  );
}
