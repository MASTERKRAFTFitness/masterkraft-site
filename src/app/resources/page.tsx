import Link from "next/link";
import type { Metadata } from "next";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
import ResourcesList, { type ResourceProduct } from "@/components/marketing/ResourcesList";
import docs from "@/lib/resource-docs.json";
import { blogEnabled, BLOG_PREFIX } from "@/lib/opinly-content";

export const metadata: Metadata = {
  title: "Resources | Manuals, Guides & Spec Sheets",
  description:
    "Product manuals, installation guides and technical documents for MasterKraft equipment.",
  alternates: { canonical: "/resources" },
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
          <Link href="/contact" className="underline decoration-accent-600 underline-offset-2">
            Contact us
          </Link>{" "}
          and we&apos;ll send it through.
        </p>
      </section>

      {/* THE JOURNAL, CONDITIONAL, for the same reason the footer's link is:
          /blog is served by Opinly and 404s whenever OPINLY_CDN_NAMESPACE is
          unset, so a static entry here would be a dead link on an indexed page.
          Gated on the check the route itself uses, so the link exists exactly
          when the page does.

          A LINK, NOT A POST LIST. Pulling the latest few posts would read
          better, but this page is fully static today and an Opinly fetch would
          make it revalidate on a timer — a manuals index does not need to be
          re-rendered hourly to stay correct, and the blog already has its own
          index doing exactly that job. If this ever becomes a post list, it
          needs a `revalidate` and the `opinly` tag, or publishing a post will
          silently stop updating it. */}
      {blogEnabled() && (
        <section className="container-mk pb-16">
          <Eyebrow className="mb-6">From the Journal</Eyebrow>
          <p className="text-ash max-w-3xl leading-relaxed">
            Manuals cover the equipment you already own. For how commercial gyms
            get specified, costed and built &mdash; duty cycles, frame standards,
            warranty terms and fit-out budgets &mdash; read the{" "}
            <Link
              href={BLOG_PREFIX}
              className="underline decoration-accent-600 underline-offset-2"
            >
              MasterKraft Journal
            </Link>
            .
          </p>
        </section>
      )}
    </>
  );
}
