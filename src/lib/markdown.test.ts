// The Journal's Markdown renderer.
//
// Two things are pinned here. SAFETY: post bodies can be rewritten by a client
// approver in Part Time CMO's portal and are rendered on a public page, so no
// input may produce a tag this file did not write. FIDELITY: the 13 posts moved
// from Opinly on 14 Oct 2026 were checked against the live pages before the
// move (same text, heading ids, images and links); the cases below keep the
// rules that check depended on.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderMarkdown, headingId } from "@/lib/markdown";

describe("renderMarkdown safety", () => {
  it("shows raw HTML as text", () => {
    const out = renderMarkdown("Hello <script>alert(1)</script> <img src=x onerror=alert(1)>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("drops unsafe link and image schemes", () => {
    const out = renderMarkdown("[click](javascript:alert(1)) ![x](data:text/html;base64,AAAA) [p](//evil.com)");
    expect(out).not.toMatch(/href=|src=/);
  });

  it("cannot break out of an attribute", () => {
    const out = renderMarkdown('[a](/x"onmouseover="alert(1))');
    expect(out).not.toContain('"onmouseover');
  });
});

describe("renderMarkdown structure", () => {
  it("gives headings Opinly's ids and never emits an h1", () => {
    const out = renderMarkdown("# Top\n\n## Singapore's Climate\n\n### 1\\. Stocking distributor");
    expect(out).toContain('<h2 id="top">');
    expect(out).toContain('<h2 id="singapore-s-climate">');
    expect(out).toContain('<h3 id="1-stocking-distributor">1. Stocking distributor</h3>');
    expect(out).not.toContain("<h1");
  });

  it("keeps a loose numbered list as one list", () => {
    const out = renderMarkdown("1. one\n\n2. two\n\n3. three");
    expect(out.match(/<ol>/g)).toHaveLength(1);
    expect(out.match(/<li>/g)).toHaveLength(3);
  });

  it("renders GFM tables", () => {
    const out = renderMarkdown("| Line | Amount |\n| --- | --- |\n| **Landed cost** | 12,660 |");
    expect(out).toContain("<thead><tr><th>Line</th><th>Amount</th></tr></thead>");
    expect(out).toContain("<td><strong>Landed cost</strong></td>");
  });

  it("renders images with titles, and opens only off-site links in a new tab", () => {
    const out = renderMarkdown('![Alt](/blog-images/a.webp "A title") [in](/distributor) [out](https://example.com)');
    expect(out).toContain('<img src="/blog-images/a.webp" alt="Alt" title="A title"');
    expect(out).toContain('<a href="/distributor">in</a>');
    expect(out).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">out</a>');
  });

  it("applies the classes it is given", () => {
    expect(renderMarkdown("Para", { p: "mb-5" })).toBe('<p class="mb-5">Para</p>');
  });
});

describe("the imported Journal", () => {
  const exp = JSON.parse(
    readFileSync(new URL("../../scripts/data/opinly-blog-export-2026-10-14.json", import.meta.url), "utf8"),
  ) as { posts: { slug: string; bodyMd: string; bodyImages: string[] }[] };

  it.each(exp.posts.map((p) => [p.slug, p] as const))("%s renders every image and no raw markers", (_, p) => {
    const out = renderMarkdown(p.bodyMd);
    for (const key of p.bodyImages) expect(out).toContain(`src="/blog-images/${key}"`);
    expect(out).not.toMatch(/\*\*|\]\(|^#{1,6} /m);
  });
});

it("headingId collapses punctuation the way Opinly did", () => {
  expect(headingId("Why 'Commercial Grade' Is a Marketing Term, Not a Standard")).toBe(
    "why-commercial-grade-is-a-marketing-term-not-a-standard",
  );
  expect(headingId("Delivery and Installation: The Quote You Didn't Get")).toBe(
    "delivery-and-installation-the-quote-you-didn-t-get",
  );
});
