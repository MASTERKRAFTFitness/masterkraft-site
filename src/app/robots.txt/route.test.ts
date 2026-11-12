import { describe, it, expect } from "vitest";
import { robotsTxt } from "./route";

describe("robots.txt", () => {
  it("shuts every crawler out of a host that is not the site", () => {
    expect(robotsTxt(false)).toBe("User-Agent: *\nDisallow: /\n");
  });

  it("keeps the rules robots.ts had, plus the Content-Signal line", () => {
    const txt = robotsTxt(true);
    expect(txt).toContain("Content-Signal: search=yes, ai-input=yes");
    expect(txt).not.toContain("ai-train");
    for (const p of ["/cart", "/checkout", "/api/", "/wholesale-login", "/admin"]) {
      expect(txt).toContain(`Disallow: ${p}\n`);
    }
    // /portal stays crawlable so Google can read its noindex. See the route.
    expect(txt).not.toContain("/portal");
    expect(txt).toMatch(/Sitemap: \S+\/sitemap\.xml/);
  });
});
