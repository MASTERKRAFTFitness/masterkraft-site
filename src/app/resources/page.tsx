import Link from "next/link";
import type { Metadata } from "next";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
import ResourcesList, { type ResourceProduct } from "@/components/marketing/ResourcesList";
import docs from "@/lib/resource-docs.json";
import PostCardGrid from "@/components/blog/PostCardGrid";
import { blogEnabled, getOpinly, BLOG_PREFIX } from "@/lib/opinly-content";

export const metadata: Metadata = {
  title: "Resources | Manuals, Guides & Spec Sheets",
  description:
    "Product manuals, installation guides and technical documents for MasterKraft equipment.",
  alternates: { canonical: "/resources" },
};

// The Journal preview below reads from Opinly, so this page is no longer fully
// static. Same arrangement as /blog: an hour is only the backstop, and the
// `content.routes-changed` webhook at /api/opinly revalidates this path (and
// drops the `opinly` data-cache tag every getOpinly() fetch carries) the
// moment a post is published, so a new post shows up here in seconds.
export const revalidate = 3600;

const PREVIEW_COUNT = 3;

/**
 * The latest few Journal posts, or none.
 *
 * Never throws: the manuals are what this page is for, and Opinly having a bad
 * minute must not take them down with it. No posts means no section, the same
 * as when the blog is not configured at all.
 */
async function latestPosts() {
  if (!blogEnabled()) return [];
  try {
    return (await getOpinly().posts({ limit: PREVIEW_COUNT })).data;
  } catch (e) {
    console.warn("[opinly] journal preview unavailable on /resources", e);
    return [];
  }
}

export default async function ResourcesPage() {
  const posts = await latestPosts();

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
          Gated on the check the route itself uses, so the section exists
          exactly when the blog does. */}
      {posts.length > 0 && (
        <section className="border-t border-line">
          <div className="container-mk py-16">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow className="mb-4">From the Journal</Eyebrow>
                <p className="text-ash max-w-3xl leading-relaxed">
                  Manuals cover the equipment you already own. The Journal covers how
                  commercial gyms get specified, costed and built &mdash; duty cycles,
                  frame standards, warranty terms and fit-out budgets.
                </p>
              </div>
              <Link
                href={BLOG_PREFIX}
                className="font-mono text-[0.72rem] uppercase tracking-[0.14em] underline decoration-accent-600 underline-offset-4 hover:text-accent-600"
              >
                View all articles &rarr;
              </Link>
            </div>
            <PostCardGrid posts={posts} />
          </div>
        </section>
      )}
    </>
  );
}
