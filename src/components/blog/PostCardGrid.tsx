import Image from "next/image";
import Link from "next/link";
import { formatDate } from "@opinly/next";
import { imageUrl, postPath } from "@opinly/shared";
import type { Post } from "@opinly/backend";
import { blogConfig } from "@/lib/opinly-content";

/**
 * A grid of post cards — the body of the index, and of every category, tag and
 * author archive.
 *
 * The card image goes through next/image for its lazy-loading and its reserved
 * layout box (this site measured CLS 0.464 down to 0 once, and an unsized image
 * in a grid is how that comes back), but `unoptimized` because these arrive from
 * Opinly's CDN via the /blog-images rewrite: same-origin as far as next/image is
 * concerned, and therefore eligible for the Vercel optimiser that blanked the
 * site at 402 in September. See the notes in next.config.ts.
 */
export default function PostCardGrid({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return <p className="text-ash">No posts here yet.</p>;
  }

  return (
    <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => {
        const href = postPath(blogConfig, post);
        const src = post.image?.fileKey ? imageUrl(post.image.fileKey, blogConfig) : null;
        return (
          <article key={post.slug} className="group flex flex-col">
            <Link href={href} className="block">
              <div className="relative aspect-[16/10] bg-smoke overflow-hidden">
                {src && (
                  <Image
                    src={src}
                    // Opinly carries the author's alt text; falling back to the
                    // post title is better than alt="" for a link thumbnail,
                    // which is what a screen reader announces the link as.
                    alt={post.image?.alt || post.title}
                    fill
                    unoptimized
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
              </div>
            </Link>
            <div className="mt-4 flex-1 flex flex-col">
              {post.category && (
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-accent-600">
                  {post.category.name}
                </p>
              )}
              <h2 className="mt-2 text-base md:text-lg font-bold leading-snug">
                <Link href={href} className="hover:text-accent-600">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm text-ash leading-relaxed line-clamp-3">
                {post.description}
              </p>
              <p className="mt-3 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-ash">
                <time dateTime={post.firstPublishedAt}>{formatDate(post.firstPublishedAt)}</time>
                {post.author && <> · {post.author.name}</>}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
