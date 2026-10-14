import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { recordNotFound } from "@/lib/not-found-log";
import { BLOG_PREFIX, blogEnabled, listAuthors, listPosts } from "@/lib/blog";
import { loadRoute, routeMetadata } from "@/lib/blog-route";
import BlogRouteView from "@/components/blog/BlogRouteView";

// An hour is only the backstop. /api/revalidate/blog drops the `blog` cache tag
// and re-renders the affected paths the moment a post is published or edited.
export const revalidate = 3600;

type BlogPageProps = { params: Promise<{ slug?: string[] }> };

/**
 * Prerender every live URL at build time.
 *
 * Returns [] rather than throwing when Supabase is unconfigured or unreachable:
 * a build must not fail because the database had a bad minute. The route is
 * still dynamic at request time, so nothing is lost but the prerender.
 */
export async function generateStaticParams() {
  if (!blogEnabled()) return [];
  try {
    const [posts, authors] = await Promise.all([listPosts(), listAuthors()]);
    return [
      { slug: [] },
      { slug: ["authors"] },
      ...authors.map((a) => ({ slug: ["authors", a.slug] })),
      ...posts.map((p) => ({ slug: [p.slug] })),
    ];
  } catch (e) {
    console.warn("[blog] routes unavailable at build; /blog stays dynamic", e);
    return [];
  }
}

export async function generateMetadata(props: BlogPageProps): Promise<Metadata> {
  if (!blogEnabled()) return {};
  const { slug } = await props.params;
  try {
    return routeMetadata(await loadRoute(slug ?? []));
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
