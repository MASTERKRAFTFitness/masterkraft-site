// The Journal (/blog), read from Supabase.
//
// SERVER ONLY, like product-content and product-gallery: the service role key,
// against tables with RLS on and no policies. Never import this from a client
// component.
//
// Until October 2026 the Journal was fetched from Opinly's content API. The
// posts were moved into blog_posts / blog_authors at the URLs Opinly served
// them at (supabase/migrations/20261014_blog_posts.sql,
// scripts/blog-import-opinly.mjs), and this file is the whole read side.
//
// EVERY READ IS TAGGED `blog`. /api/revalidate/blog drops that tag when a post
// is published or edited, and it must drop the rendered paths too — see the
// note in that route. Lose the tag and a new post waits out the hour.
import { unstable_cache } from "next/cache";
import { adminDb, adminDbConfigured } from "@/lib/admin-db";

/** Where the Journal is mounted. Also the prefix every post URL starts with. */
export const BLOG_PREFIX = "/blog";
/** The apex, literally: the one canonical home of every post. */
export const BLOG_SITE_URL = "https://masterkraft.com";
/**
 * Images are served from the blog-images bucket at this same-origin path (the
 * rewrite is in next.config.ts). It is the path Opinly's CDN was mounted at, so
 * every image URL already shared or indexed keeps resolving.
 */
export const BLOG_IMAGES_PREFIX = "/blog-images";
export const BLOG_TAG = "blog";

export type BlogAuthor = {
  slug: string;
  name: string;
  bio: string | null;
  imageKey: string | null;
};

export type BlogFaq = { question: string; answer: string };

/** What a card, the RSS feed and the sitemap need. */
export type BlogPostSummary = {
  slug: string;
  title: string;
  description: string;
  heroImageKey: string | null;
  heroImageAlt: string | null;
  publishedAt: string;
  modifiedAt: string | null;
  author: Pick<BlogAuthor, "slug" | "name"> | null;
};

export type BlogPost = BlogPostSummary & {
  metaTitle: string | null;
  metaDescription: string | null;
  bodyMd: string;
  faqs: BlogFaq[];
  author: BlogAuthor | null;
};

/** Same condition the rest of the site uses for "Supabase is reachable". */
export function blogEnabled(): boolean {
  return adminDbConfigured();
}

export function postPath(slug: string): string {
  return `${BLOG_PREFIX}/${slug}`;
}

export function postUrl(slug: string): string {
  return `${BLOG_SITE_URL}${postPath(slug)}`;
}

export function authorPath(slug: string): string {
  return `${BLOG_PREFIX}/authors/${slug}`;
}

export function blogImagePath(key: string): string {
  return `${BLOG_IMAGES_PREFIX}/${key}`;
}

type Row = {
  slug: string;
  title: string;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
  body_md: string;
  hero_image_key: string | null;
  hero_image_alt: string | null;
  faqs: unknown;
  published_at: string;
  modified_at: string | null;
  author_slug: string | null;
};

type AuthorRow = { slug: string; name: string; bio: string | null; image_key: string | null };

const toAuthor = (a: AuthorRow): BlogAuthor => ({
  slug: a.slug,
  name: a.name,
  bio: a.bio,
  imageKey: a.image_key,
});

function toFaqs(v: unknown): BlogFaq[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (f): f is BlogFaq =>
      !!f && typeof f.question === "string" && typeof f.answer === "string" && !!f.question.trim(),
  );
}

/**
 * Every live post and every author, in one read.
 *
 * ONE READ, NOT ONE PER PAGE. The Journal is a few dozen posts; the whole thing
 * is smaller than a single product image. Reading it once an hour and slicing in
 * memory keeps the index, archives, sitemap and feed agreeing on what is live,
 * which separate queries cached at different moments would not.
 *
 * "Live" is published_at <= now() at the moment of the read. A row written ahead
 * of its date therefore appears at the first read after that date — within the
 * hour, or immediately when the publish route revalidates.
 */
async function readJournal(): Promise<{ posts: BlogPost[]; authors: BlogAuthor[] }> {
  const db = adminDb();
  if (!db) return { posts: [], authors: [] };

  const [posts, authors] = await Promise.all([
    db
      .from("blog_posts")
      .select(
        "slug, title, description, meta_title, meta_description, body_md, hero_image_key, hero_image_alt, faqs, published_at, modified_at, author_slug",
      )
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false }),
    db.from("blog_authors").select("slug, name, bio, image_key"),
  ]);
  if (posts.error) throw new Error(`blog_posts: ${posts.error.message}`);
  if (authors.error) throw new Error(`blog_authors: ${authors.error.message}`);

  const byAuthor = new Map((authors.data as AuthorRow[]).map((a) => [a.slug, toAuthor(a)]));
  return {
    authors: [...byAuthor.values()],
    posts: (posts.data as Row[]).map((r) => ({
      slug: r.slug,
      title: r.title,
      description: r.description ?? "",
      metaTitle: r.meta_title,
      metaDescription: r.meta_description,
      bodyMd: r.body_md,
      heroImageKey: r.hero_image_key,
      heroImageAlt: r.hero_image_alt,
      faqs: toFaqs(r.faqs),
      publishedAt: r.published_at,
      modifiedAt: r.modified_at,
      author: r.author_slug ? (byAuthor.get(r.author_slug) ?? null) : null,
    })),
  };
}

const cachedJournal = unstable_cache(readJournal, ["blog-journal-v1"], {
  revalidate: 3600,
  tags: [BLOG_TAG],
});

/**
 * The whole live Journal. Throws on a database error so a caller can decide
 * between a 503 (the feed) and an empty section (the footer, /resources).
 */
export async function getJournal() {
  return cachedJournal();
}

export function summarise(p: BlogPost): BlogPostSummary {
  return {
    slug: p.slug,
    title: p.title,
    description: p.description,
    heroImageKey: p.heroImageKey,
    heroImageAlt: p.heroImageAlt,
    publishedAt: p.publishedAt,
    modifiedAt: p.modifiedAt,
    author: p.author ? { slug: p.author.slug, name: p.author.name } : null,
  };
}

/** Newest first. `limit` omitted returns every live post. */
export async function listPosts(limit?: number): Promise<BlogPostSummary[]> {
  const { posts } = await getJournal();
  return (limit ? posts.slice(0, limit) : posts).map(summarise);
}

/** A live post, or null. A scheduled or unpublished slug is null, i.e. a 404. */
export async function getPost(slug: string): Promise<BlogPost | null> {
  const { posts } = await getJournal();
  return posts.find((p) => p.slug === slug) ?? null;
}

/**
 * Authors who have at least one live post, each with their posts.
 *
 * An author with nothing published is left out: an archive page with no posts
 * on it is thin content, and the sitemap must not advertise one.
 */
export async function listAuthors(): Promise<(BlogAuthor & { posts: BlogPostSummary[] })[]> {
  const { posts, authors } = await getJournal();
  return authors
    .map((a) => ({ ...a, posts: posts.filter((p) => p.author?.slug === a.slug).map(summarise) }))
    .filter((a) => a.posts.length > 0);
}

export async function getAuthor(slug: string) {
  return (await listAuthors()).find((a) => a.slug === slug) ?? null;
}

/**
 * Minutes to read, rounded up at 200 words a minute. Within a minute of what
 * Opinly showed for every imported post; link URLs and image paths are left out
 * of the count so a post full of links does not read as longer.
 */
export function readingMinutes(markdown: string): number {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|\\]/g, " ");
  const words = text.split(/\s+/).filter((w) => /\w/.test(w)).length;
  return Math.max(1, Math.ceil(words / 200));
}

/** "Oct 07, 2026" — the format the Journal has shown since launch, in UTC as it was. */
export function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
