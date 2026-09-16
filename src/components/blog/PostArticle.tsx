import Link from "next/link";
import { formatDate, buildBlogPostingJsonLd, buildFaqJsonLd } from "@opinly/next";
import { buildBreadcrumbJsonLd, imageUrl, categoryPath, authorPath, tagPath, calculateReadingTime, blogUrl, postUrl } from "@opinly/shared";
import { OpinlyContent } from "@opinly/react";
import type { FullPost } from "@opinly/backend";
import PageHero from "@/components/marketing/PageHero";
import JsonLd from "@/components/seo/JsonLd";
import { blogConfig } from "@/lib/opinly-content";
import { postProse } from "@/components/blog/prose";

export default function PostArticle({ post }: { post: FullPost }) {
  const hero = post.titleFile?.fileKey ? imageUrl(post.titleFile.fileKey, blogConfig) : undefined;
  const minutes = calculateReadingTime(post.content);

  return (
    <>
      <PageHero
        eyebrow={post.category?.name ?? "Journal"}
        title={post.title}
        subtitle={post.description}
        image={hero}
        // The post's own alt text, not the shared banner registry's: these
        // photographs are not in lib/image-alt and never will be, because they
        // arrive with the content rather than with the build.
        imageAlt={post.titleFile?.altText ?? ""}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Journal", href: blogConfig.blogPrefix ?? "/blog" },
          ...(post.category
            ? [{ name: post.category.name, href: categoryPath(blogConfig, post.category.slug) }]
            : []),
        ]}
      />

      <article className="container-mk max-w-3xl py-14 md:py-16">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-ash mb-8">
          <time dateTime={post.firstPublishedAt}>{formatDate(post.firstPublishedAt)}</time>
          {post.author && (
            <>
              {" · "}
              <Link href={authorPath(blogConfig, post.author.slug)} className="hover:text-ink">
                {post.author.name}
              </Link>
            </>
          )}
          {" · "}
          {minutes} min read
        </p>

        <OpinlyContent content={post.content} config={blogConfig} classNames={postProse} />

        {post.faqs && post.faqs.length > 0 && (
          <section className="mt-14 border-t border-line pt-10">
            <h2 className="text-xl font-bold mb-6">Frequently asked</h2>
            <dl className="space-y-6">
              {post.faqs.map((faq) => (
                <div key={faq.question}>
                  <dt className="font-bold mb-1.5">{faq.question}</dt>
                  <dd className="text-ash leading-relaxed">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {post.tags.length > 0 && (
          <nav aria-label="Topics" className="mt-12 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Link
                key={tag.slug}
                href={tagPath(blogConfig, tag.slug)}
                className="font-mono text-[0.68rem] uppercase tracking-[0.14em] border border-line px-3 py-1.5 hover:border-ink"
              >
                {tag.name}
              </Link>
            ))}
          </nav>
        )}
      </article>

      {/* BlogPosting + breadcrumbs, and FAQPage only when the post actually
          carries FAQs — an empty FAQPage is a structured-data error, not a
          harmless no-op, and Search Console reports it as one. */}
      <JsonLd data={buildBlogPostingJsonLd(post) as unknown as Record<string, unknown>} />
      <JsonLd
        data={
          buildBreadcrumbJsonLd([
            { name: "Home", url: blogConfig.siteUrl ?? "" },
            { name: "Journal", url: blogUrl(blogConfig) },
            ...(post.category
              ? [
                  {
                    name: post.category.name,
                    url: `${blogConfig.siteUrl ?? ""}${categoryPath(blogConfig, post.category.slug)}`,
                  },
                ]
              : []),
            { name: post.title, url: postUrl(blogConfig, post) },
          ]) as unknown as Record<string, unknown>
        }
      />
      {post.faqs && post.faqs.length > 0 && (
        <JsonLd data={buildFaqJsonLd(post.faqs) as unknown as Record<string, unknown>} />
      )}
    </>
  );
}
