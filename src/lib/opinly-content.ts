import { createOpinlyClient, type OpinlyClient } from "@opinly/backend";
import { opinlyConfig } from "@opinly/next";
import type { OpinlyConfig } from "@opinly/shared";

// Opinly content — the third client in this codebase, and the one that reads
// rather than writes.
//
//   lib/opinly.ts         browser pixel  (publishable pk- key, client-side)
//   lib/opinly-server.ts  purchase sink  (secret sk- key, never cached)
//   this file             published blog (secret sk- key, cached and tagged)
//
// They are deliberately not one module. An analytics write must never be
// deduped against a content read, and the content reads want exactly the
// caching that a purchase report must never have.

/** The `blogPath` given to withOpinlyConfig, and Opinly's own default. */
const BLOG_PREFIX_FALLBACK = "/blog";

/**
 * Render-time config for @opinly/shared's URL and JSON-LD builders.
 *
 * Built from the env vars withOpinlyConfig injected, so there is one source of
 * truth for where the blog lives — next.config.ts — and no way for a URL built
 * here to disagree with the one reported to Opinly.
 */
export const blogConfig: OpinlyConfig = {
  imagesPrefix: opinlyConfig.imagesPrefix,
  siteUrl: opinlyConfig.siteUrl,
  blogPrefix: opinlyConfig.blogPrefix,
  siteName: opinlyConfig.siteName,
  categoryPrefix: opinlyConfig.categoryPrefix,
  authorPrefix: opinlyConfig.authorPrefix,
  tagPrefix: opinlyConfig.tagPrefix,
};

/** Where the blog is mounted. Falls back so a URL is never built as `undefined/...`. */
export const BLOG_PREFIX = opinlyConfig.blogPrefix || BLOG_PREFIX_FALLBACK;

/**
 * Whether the blog can serve at all.
 *
 * False when `OPINLY_CDN_NAMESPACE` is unset, because next.config.ts then skips
 * withOpinlyConfig and none of the OPINLY_* env vars exist. Rendering anyway
 * would produce a blog whose posts link to `undefined/my-post` and whose images
 * point at a CDN folder that was never configured, so the route 404s instead —
 * a page that does not exist is honest, a broken one is not.
 *
 * The API key is checked too: it is what every call below needs, and an
 * unconfigured key and an unconfigured namespace are the same outage.
 */
export function blogEnabled(): boolean {
  return !!opinlyConfig.blogPrefix && !!opinlyConfig.imagesPrefix && !!process.env.OPINLY_API_KEY;
}

let client: OpinlyClient | null = null;

/**
 * The Opinly content client.
 *
 * Built lazily and never exported as a ready-made instance: createOpinlyClient
 * throws when OPINLY_API_KEY is unset, and at module scope that throw happens
 * while Next collects page data — which would take down `app/sitemap.ts` (every
 * product URL on the site) rather than just the blog, because the sitemap
 * imports this module. Lazily, the caller can catch it.
 *
 * EVERY FETCH IS TAGGED `opinly`, and that tag is load-bearing: it is the single
 * handle /api/opinly uses to drop the whole blog's data cache when a post is
 * published or edited. Lose the tag and publishing silently stops working —
 * revalidatePath clears the rendered page but leaves the cached API response
 * behind it, so the new post is fetched from cache and the page re-renders
 * identically.
 *
 * Never import this module from a client component: it carries the secret key.
 */
export function getOpinly(): OpinlyClient {
  if (!client) {
    client = createOpinlyClient({
      fetch: (url, init) =>
        fetch(url, { ...init, cache: "force-cache", next: { tags: ["opinly"] } }),
    });
  }
  return client;
}
