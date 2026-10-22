// Internal journal links must render followable. See lib/blog-links.ts for the
// audit finding this pins down; the assertions run through the real Opinly
// renderer so a change to its rel fallback shows up here, not in Search Console.
import { describe, it, expect } from "vitest";
import { renderToHtml, type OpinlyNode } from "@opinly/shared";
import { followInternalLinks, isInternalHref } from "@/lib/blog-links";

const SITE = "https://masterkraft.com";
const TIPTAP_REL = { rel: "noopener noreferrer nofollow", target: "_blank" };

const doc = (href: string): OpinlyNode => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Become a distributor", marks: [{ type: "link", attrs: { href, ...TIPTAP_REL } }] }],
    },
  ],
});

const render = (content: OpinlyNode) =>
  renderToHtml(followInternalLinks(content, SITE), { config: { imagesPrefix: "/blog-images", siteUrl: SITE } });

describe("followInternalLinks", () => {
  it("drops nofollow and the new tab from a root-relative link", () => {
    const html = render(doc("/distributor"));
    expect(html).toContain('href="/distributor"');
    expect(html).not.toContain("nofollow");
    expect(html).not.toContain("_blank");
  });

  it("treats an absolute URL on our own host, www or not, as internal", () => {
    expect(render(doc("https://www.masterkraft.com/distributor"))).not.toContain("nofollow");
  });

  it("leaves external links exactly as the author saved them", () => {
    const html = render(doc("https://example.com/report"));
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it("does not mutate the content it is given", () => {
    const content = doc("/distributor");
    const before = JSON.stringify(content);
    followInternalLinks(content, SITE);
    expect(JSON.stringify(content)).toBe(before);
  });
});

describe("isInternalHref", () => {
  it.each([
    ["/distributor", true],
    ["//evil.example/x", false],
    ["https://masterkraft.com/blog/x", true],
    ["https://shop.masterkraft.com/x", false],
    ["mailto:sales@masterkraft.com", false],
    ["not a url", false],
  ])("%s → %s", (href, expected) => {
    expect(isInternalHref(href, SITE)).toBe(expected);
  });
});
