import Link from "next/link";
import { categoryPath, authorPath } from "@opinly/shared";
import PageHero from "@/components/marketing/PageHero";
import PostCardGrid from "@/components/blog/PostCardGrid";
import PostArticle from "@/components/blog/PostArticle";
import { blogConfig } from "@/lib/opinly-content";
import type { BlogRoute } from "@/lib/blog-route";

/**
 * One view per resolved route type.
 *
 * `not-found` never reaches here — the page calls notFound() on it so the 404 is
 * a real 404 with a real status code, rather than a 200 that says "not found",
 * which is the version Google indexes.
 */
export default function BlogRouteView({ route }: { route: BlogRoute }) {
  switch (route.type) {
    case "post":
      return <PostArticle post={route.data} />;

    case "home":
      return (
        <>
          <PageHero
            eyebrow="Journal"
            title="Journal"
            subtitle="Equipment, fitouts and how commercial gyms actually get built."
            breadcrumbs={[
              { name: "Home", href: "/" },
              { name: "Journal", href: blogConfig.blogPrefix ?? "/blog" },
            ]}
          />
          <section className="container-mk py-14 md:py-16">
            {route.data.categories.length > 0 && (
              <nav aria-label="Categories" className="mb-12 flex flex-wrap gap-2">
                {route.data.categories.map((c) => (
                  <Link
                    key={c.slug}
                    href={categoryPath(blogConfig, c.slug)}
                    className="font-mono text-[0.68rem] uppercase tracking-[0.14em] border border-line px-3 py-1.5 hover:border-ink"
                  >
                    {c.title}
                  </Link>
                ))}
              </nav>
            )}
            <PostCardGrid posts={route.data.posts} />
          </section>
        </>
      );

    case "category":
      return (
        <>
          <PageHero
            eyebrow="Journal"
            title={route.data.name}
            subtitle={route.data.description ?? undefined}
            breadcrumbs={[
              { name: "Home", href: "/" },
              { name: "Journal", href: blogConfig.blogPrefix ?? "/blog" },
              { name: route.data.name, href: categoryPath(blogConfig, route.data.slug) },
            ]}
          />
          <section className="container-mk py-14 md:py-16">
            <PostCardGrid posts={route.data.posts} />
          </section>
        </>
      );

    case "tag":
      return (
        <>
          <PageHero
            eyebrow="Topic"
            title={route.data.name}
            subtitle={route.data.description ?? undefined}
          />
          <section className="container-mk py-14 md:py-16">
            <PostCardGrid posts={route.data.posts} />
          </section>
        </>
      );

    case "author":
      return (
        <>
          <PageHero
            eyebrow="Author"
            title={route.data.name}
            subtitle={route.data.bio ?? undefined}
            breadcrumbs={[
              { name: "Home", href: "/" },
              { name: "Journal", href: blogConfig.blogPrefix ?? "/blog" },
              { name: route.data.name, href: authorPath(blogConfig, route.data.slug) },
            ]}
          />
          <section className="container-mk py-14 md:py-16">
            <PostCardGrid posts={route.data.posts} />
          </section>
        </>
      );

    case "authors":
      return (
        <>
          <PageHero eyebrow="Journal" title="Authors" />
          <section className="container-mk py-14 md:py-16">
            <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {route.data.map((a) => (
                <li key={a.slug}>
                  <h2 className="text-lg font-bold">
                    <Link href={authorPath(blogConfig, a.slug)} className="hover:text-accent-600">
                      {a.name}
                    </Link>
                  </h2>
                  {a.bio && <p className="mt-2 text-sm text-ash leading-relaxed">{a.bio}</p>}
                </li>
              ))}
            </ul>
          </section>
        </>
      );

    default:
      return null;
  }
}
