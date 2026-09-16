import { opinlyConfig } from "@opinly/next";
import type { SeoResolved } from "@opinly/shared";
import { getOpinly } from "@/lib/opinly-content";

// The three archive segments. @opinly/shared's URL builders apply these same
// defaults when the config leaves them unset, so reading them here is what keeps
// the URLs this route ANSWERS identical to the URLs the sitemap ADVERTISES. Set
// one in next.config.ts and both move together; hardcode one here and they part
// company silently, which shows up as a sitemap full of 404s.
const categoryPrefix = opinlyConfig.categoryPrefix ?? "category";
const authorPrefix = opinlyConfig.authorPrefix ?? "authors";
const tagPrefix = opinlyConfig.tagPrefix ?? "tag";

/**
 * Resolve a blog URL once, for both generateMetadata and the render.
 *
 * One resolver in one place is what stops a page's `<title>` and canonical from
 * describing something other than its body; Next dedupes the underlying fetches
 * across the two calls, so the second resolution is free.
 *
 * ONE OPTIONAL CATCH-ALL HANDLES EVERY BLOG URL, index included. The CareLocate
 * build of this integration splits the index into its own `app/blog/page.tsx`
 * alongside a required `[...slug]`, and that split must NOT be copied here: it
 * exists only to dodge a Next 15 bug where `[[...slug]]` combined with
 * `runtime = 'edge'` delivers an empty params object, so every post silently
 * rendered the index. Nothing in this app runs on the edge runtime, and this is
 * Next 16, so the documented single optional catch-all is both correct and one
 * fewer file to keep in step.
 */
export async function loadRoute(slug: string[]) {
  if (slug.length === 0) {
    const [posts, categories] = await Promise.all([
      getOpinly().posts({ limit: 12 }),
      getOpinly().categories(),
    ]);
    return { type: "home" as const, data: { posts: posts.data, categories } };
  }

  if (slug[0] === categoryPrefix && slug[1]) {
    const [categories, list] = await Promise.all([
      getOpinly().categories(),
      getOpinly().posts({ category: slug[1] }),
    ]);
    const meta = categories.find((c) => c.slug === slug[1]);
    if (!meta) return { type: "not-found" as const };
    // CategorySummary calls it `title`; SeoResolved wants `name`.
    return { type: "category" as const, data: { ...meta, name: meta.title, posts: list.data } };
  }

  // Tag archives exist because routes() emits tag routes and buildSitemapEntries
  // turns them into URLs. Drop this branch and the sitemap submits
  // /blog/tag/<slug> pages that 404 — the site's own sitemap teaching Google
  // that a fifth of the blog is broken.
  if (slug[0] === tagPrefix && slug[1]) {
    const [tags, list] = await Promise.all([
      getOpinly().tags(),
      getOpinly().posts({ tag: slug[1] }),
    ]);
    const meta = tags.find((t) => t.slug === slug[1]);
    if (!meta) return { type: "not-found" as const };
    return { type: "tag" as const, data: { ...meta, posts: list.data } };
  }

  if (slug[0] === authorPrefix) {
    const authorSlug = slug[1];
    if (!authorSlug) {
      return { type: "authors" as const, data: (await getOpinly().authors()).data };
    }
    const author = await getOpinly().author(authorSlug);
    return author.type === "author"
      ? { type: "author" as const, data: author.data }
      : { type: "not-found" as const };
  }

  // Posts are addressed FLAT — one segment, never nested under their category.
  // A two-segment URL that got this far is not a post with a category in front
  // of it, it is a 404.
  if (slug.length !== 1) return { type: "not-found" as const };
  const post = await getOpinly().post(slug[0]);
  return post ? { type: "post" as const, data: post } : { type: "not-found" as const };
}

export type BlogRoute = Awaited<ReturnType<typeof loadRoute>>;

/** Narrow a resolved route to the shape @opinly/next's metadata builder wants. */
export function toSeo(route: BlogRoute): SeoResolved {
  return route.type === "post" ||
    route.type === "category" ||
    route.type === "author" ||
    route.type === "tag"
    ? ({ type: route.type, data: route.data } as SeoResolved)
    : { type: route.type };
}
