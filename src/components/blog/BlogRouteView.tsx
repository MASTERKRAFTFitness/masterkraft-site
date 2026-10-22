import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import PostCardGrid from "@/components/blog/PostCardGrid";
import PostArticle from "@/components/blog/PostArticle";
import { BLOG_PREFIX, authorPath } from "@/lib/blog";
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
              { name: "Journal", href: BLOG_PREFIX },
            ]}
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
              { name: "Journal", href: BLOG_PREFIX },
              { name: route.data.name, href: authorPath(route.data.slug) },
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
                    <Link href={authorPath(a.slug)} className="hover:text-accent-600">
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
