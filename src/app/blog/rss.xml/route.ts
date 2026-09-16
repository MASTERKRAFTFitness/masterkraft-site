import { buildRssItems, escapeHtml, blogUrl } from "@opinly/shared";
import { blogConfig, blogEnabled, getOpinly } from "@/lib/opinly-content";

// Matches the blog route's backstop; the /api/opinly webhook revalidates this
// path by name when the blog home changes, which is what actually keeps it fresh.
export const revalidate = 3600;

/**
 * The blog's RSS feed.
 *
 * Hand-serialised rather than pulled in as a dependency: the whole feed is six
 * tags, and `buildRssItems` has already done the part that is easy to get wrong
 * (turning slugs into absolute URLs with the configured blog prefix).
 */
export async function GET() {
  if (!blogEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  let items;
  try {
    items = buildRssItems(await getOpinly().rss({ limit: 50 }), blogConfig);
  } catch (e) {
    // A feed reader retrying in an hour is a better outcome than a 200 with an
    // empty feed, which some readers treat as "everything was deleted".
    console.warn("[opinly] rss unavailable", e);
    return new Response("Feed temporarily unavailable", { status: 503 });
  }

  const self = `${blogUrl(blogConfig)}/rss.xml`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(`${blogConfig.siteName ?? "MASTERKRAFT"} Journal`)}</title>
    <link>${escapeHtml(blogUrl(blogConfig))}</link>
    <description>Equipment, fitouts and how commercial gyms actually get built.</description>
    <language>en-AU</language>
    <atom:link href="${escapeHtml(self)}" rel="self" type="application/rss+xml"/>
${items
  .map(
    (item) => `    <item>
      <title>${escapeHtml(item.title)}</title>
      <link>${escapeHtml(item.url)}</link>
      <guid isPermaLink="true">${escapeHtml(item.url)}</guid>
      <pubDate>${new Date(item.date).toUTCString()}</pubDate>
      ${item.description ? `<description>${escapeHtml(item.description)}</description>` : ""}
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>`;

  return new Response(body, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
