import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { generateOpinlyMetadata } from "@opinly/next";
import { routeParams } from "@opinly/shared";
import { recordNotFound } from "@/lib/not-found-log";
import { blogConfig, blogEnabled, getOpinly, BLOG_PREFIX } from "@/lib/opinly-content";
import { loadRoute, toSeo } from "@/lib/blog-route";
import BlogRouteView from "@/components/blog/BlogRouteView";

// An hour is only the backstop. The real invalidation path is the
// `content.routes-changed` webhook at /api/opinly, which drops the `opinly`
// cache tag the moment a post is published or edited — so a post goes live in
// seconds, not on the hour.
export const revalidate = 3600;

type BlogPageProps = { params: Promise<{ slug?: string[] }> };

/**
 * Prerender every published URL at build time.
 *
 * `routeParams` turns each `routes()` entry into the exact segments this
 * catch-all expects, honouring the same category/author/tag prefixes the
 * resolver matches on — so a route that is prerendered here is a route that
 * `loadRoute` can answer, by construction rather than by two lists agreeing.
 *
 * Returns [] rather than throwing when the blog is not configured or Opinly is
 * unreachable: a build must not fail because a third-party content API had a
 * bad minute. The route is still dynamic at request time, so nothing is lost
 * but the prerender.
 */
export async function generateStaticParams() {
  if (!blogEnabled()) return [];
  try {
    const routes = await getOpinly().routes();
    return routes.map((route) => ({ slug: routeParams(blogConfig, route) }));
  } catch (e) {
    console.warn("[opinly] blog routes unavailable at build; /blog stays dynamic", e);
    return [];
  }
}

export async function generateMetadata(
  props: BlogPageProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  if (!blogEnabled()) return {};
  const { slug } = await props.params;
  try {
    return await generateOpinlyMetadata(toSeo(await loadRoute(slug ?? [])), parent);
  } catch {
    // The page below will 404 or error on its own; metadata must not be the
    // thing that throws first, because that fails the whole route rather than
    // rendering the not-found page.
    return {};
  }
}

export default async function BlogPage(props: BlogPageProps) {
  const { slug } = await props.params;
  const segments = slug ?? [];

  // NOT CONFIGURED IS A 404, NOT A CRASH. Until OPINLY_CDN_NAMESPACE is set,
  // next.config.ts skips withOpinlyConfig, so there is no images prefix to build
  // URLs from and no blog prefix to link with. Serving a page anyway would put a
  // post on the internet with broken images and `undefined/...` links in it; a
  // clean 404 says the truth, which is that the blog is not up yet.
  if (!blogEnabled()) notFound();

  const route = await loadRoute(segments);

  if (route.type === "not-found") {
    // Same treatment as /fitout and /product: a dead /blog URL is exactly the
    // kind that turns out to be an old link worth redirecting, and the path is
    // already in hand. See lib/not-found-log.ts for why it is passed, not read.
    const path = [BLOG_PREFIX, ...segments.map(encodeURIComponent)].join("/");
    after(() => recordNotFound(path));
    notFound();
  }

  return <BlogRouteView route={route} />;
}
