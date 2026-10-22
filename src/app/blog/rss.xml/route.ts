import { BLOG_PREFIX, BLOG_SITE_URL, blogEnabled, listPosts, postUrl } from "@/lib/blog";
import { escapeHtml } from "@/lib/markdown";

// Matches the blog route: ten minutes, so a post that goes live by the clock
// reaches the feed soon after. /api/revalidate/blog flushes it at once.
export const revalidate = 600;

/**
 * The blog's RSS feed. Hand-serialised: the whole feed is six tags.
 */
export async function GET() {
  if (!blogEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  let posts;
  try {
    posts = await listPosts(50);
  } catch (e) {
    // A feed reader retrying in an hour is a better outcome than a 200 with an
    // empty feed, which some readers treat as "everything was deleted".
    console.warn("[blog] rss unavailable", e);
    return new Response("Feed temporarily unavailable", { status: 503 });
  }

  const home = `${BLOG_SITE_URL}${BLOG_PREFIX}`;
  const self = `${home}/rss.xml`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>MASTERKRAFT Journal</title>
    <link>${escapeHtml(home)}</link>
    <description>Equipment, fitouts and how commercial gyms actually get built.</description>
    <language>en-AU</language>
    <atom:link href="${escapeHtml(self)}" rel="self" type="application/rss+xml"/>
${posts
  .map((p) => {
    const url = postUrl(p.slug);
    return `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${escapeHtml(url)}</link>
      <guid isPermaLink="true">${escapeHtml(url)}</guid>
      <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
      ${p.description ? `<description>${escapeHtml(p.description)}</description>` : ""}
    </item>`;
  })
  .join("\n")}
  </channel>
</rss>`;

  return new Response(body, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
