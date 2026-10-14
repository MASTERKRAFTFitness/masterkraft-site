import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import JsonLd from "@/components/seo/JsonLd";
import {
  BLOG_PREFIX,
  BLOG_SITE_URL,
  authorPath,
  blogImagePath,
  formatPostDate,
  postUrl,
  readingMinutes,
  type BlogPost,
} from "@/lib/blog";
import { renderMarkdown } from "@/lib/markdown";
import { postProse } from "@/components/blog/prose";

export default function PostArticle({ post }: { post: BlogPost }) {
  const hero = post.heroImageKey ? blogImagePath(post.heroImageKey) : undefined;
  const url = postUrl(post.slug);

  return (
    <>
      <PageHero
        eyebrow="Journal"
        title={post.title}
        subtitle={post.description}
        image={hero}
        // The post's own alt text, not the shared banner registry's: these
        // photographs are not in lib/image-alt and never will be, because they
        // arrive with the content rather than with the build.
        imageAlt={post.heroImageAlt ?? ""}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Journal", href: BLOG_PREFIX },
        ]}
      />

      <article className="container-mk max-w-3xl py-14 md:py-16">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-ash mb-8">
          <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
          {post.author && (
            <>
              {" · "}
              <Link href={authorPath(post.author.slug)} className="hover:text-ink">
                {post.author.name}
              </Link>
            </>
          )}
          {" · "}
          {readingMinutes(post.bodyMd)} min read
        </p>

        {/* renderMarkdown escapes the whole source before formatting it, so the
            only tags here are ones it wrote. See lib/markdown.ts. */}
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(post.bodyMd, postProse) }} />

        {post.faqs.length > 0 && (
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
      </article>

      {/* BlogPosting + breadcrumbs, and FAQPage only when the post actually
          carries FAQs — an empty FAQPage is a structured-data error, not a
          harmless no-op, and Search Console reports it as one. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.metaDescription || post.description,
          datePublished: post.publishedAt,
          dateModified: post.modifiedAt ?? post.publishedAt,
          mainEntityOfPage: url,
          ...(hero ? { image: `${BLOG_SITE_URL}${hero}` } : {}),
          ...(post.author
            ? {
                author: {
                  "@type": "Person",
                  name: post.author.name,
                  url: `${BLOG_SITE_URL}${authorPath(post.author.slug)}`,
                },
              }
            : {}),
          publisher: { "@type": "Organization", name: "MASTERKRAFT", url: BLOG_SITE_URL },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: BLOG_SITE_URL },
            { "@type": "ListItem", position: 2, name: "Journal", item: `${BLOG_SITE_URL}${BLOG_PREFIX}` },
            { "@type": "ListItem", position: 3, name: post.title, item: url },
          ],
        }}
      />
      {post.faqs.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: post.faqs.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer },
            })),
          }}
        />
      )}
    </>
  );
}
