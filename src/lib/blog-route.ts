import type { Metadata } from "next";
import {
  BLOG_PREFIX,
  BLOG_SITE_URL,
  authorPath,
  blogImagePath,
  getAuthor,
  getPost,
  listAuthors,
  listPosts,
  postPath,
} from "@/lib/blog";

/** The index shows this many posts. */
export const INDEX_COUNT = 12;

/**
 * Resolve a blog URL once, for both generateMetadata and the render.
 *
 * One resolver in one place is what stops a page's `<title>` and canonical from
 * describing something other than its body; the underlying read is one cached
 * call (lib/blog getJournal), so resolving twice is free.
 *
 * The URL shapes are the ones the Journal had on Opinly, because those are the
 * URLs in Google and in shared links:
 *
 *   /blog                     the index
 *   /blog/<slug>              a post — FLAT, never nested under a category
 *   /blog/authors             every author
 *   /blog/authors/<slug>      one author's posts
 *
 * Opinly also answered /blog/category/<x> and /blog/tag/<x>. No post ever had a
 * category or a tag, so no such URL was ever in the sitemap; they 404 now.
 */
export async function loadRoute(slug: string[]) {
  if (slug.length === 0) {
    return { type: "home" as const, data: { posts: await listPosts(INDEX_COUNT) } };
  }

  if (slug[0] === "authors") {
    if (slug.length === 1) return { type: "authors" as const, data: await listAuthors() };
    if (slug.length !== 2) return { type: "not-found" as const };
    const author = await getAuthor(slug[1]);
    return author ? { type: "author" as const, data: author } : { type: "not-found" as const };
  }

  if (slug.length !== 1) return { type: "not-found" as const };
  const post = await getPost(slug[0]);
  return post ? { type: "post" as const, data: post } : { type: "not-found" as const };
}

export type BlogRoute = Awaited<ReturnType<typeof loadRoute>>;

// The title the index has carried since launch; kept so its search listing does not change.
const INDEX_TITLE = "MASTERKRAFT Blog";
const INDEX_DESCRIPTION = "Equipment, fitouts and how commercial gyms actually get built.";

/**
 * The page's metadata. The root layout's title template appends the site name,
 * so titles here are bare.
 */
export function routeMetadata(route: BlogRoute): Metadata {
  switch (route.type) {
    case "post": {
      const p = route.data;
      const title = p.metaTitle || p.title;
      const description = p.metaDescription || p.description;
      const url = `${BLOG_SITE_URL}${postPath(p.slug)}`;
      const image = p.heroImageKey ? `${BLOG_SITE_URL}${blogImagePath(p.heroImageKey)}` : undefined;
      return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: {
          type: "article",
          title,
          description,
          url,
          publishedTime: p.publishedAt,
          ...(p.modifiedAt ? { modifiedTime: p.modifiedAt } : {}),
          ...(p.author ? { authors: [p.author.name] } : {}),
          ...(image ? { images: [{ url: image, alt: p.heroImageAlt ?? p.title }] } : {}),
        },
        twitter: { card: image ? "summary_large_image" : "summary", title, description },
      };
    }
    case "author":
      return {
        title: route.data.name,
        description: route.data.bio ?? undefined,
        alternates: { canonical: `${BLOG_SITE_URL}${authorPath(route.data.slug)}` },
      };
    case "authors":
      return { title: "Authors", alternates: { canonical: `${BLOG_SITE_URL}${BLOG_PREFIX}/authors` } };
    case "home":
      return {
        title: INDEX_TITLE,
        description: INDEX_DESCRIPTION,
        alternates: { canonical: `${BLOG_SITE_URL}${BLOG_PREFIX}` },
      };
    default:
      return {};
  }
}
