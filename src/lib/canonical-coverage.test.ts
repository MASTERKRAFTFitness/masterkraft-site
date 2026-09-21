// EVERY PATH THE SITEMAP ADVERTISES MUST DECLARE A CANONICAL.
//
// Seventeen static pages — our-story, warranty, privacy-policy and the rest —
// were submitted in the sitemap with no `alternates` in their metadata at all,
// and so emitted no <link rel="canonical">. That is survivable on one hostname
// and not on two: the site answers on both the apex and www (lib/site.ts's
// isIndexableHost allows both deliberately), so each of those pages existed as
// two indexable URLs with nothing to say which one was the page. Google's
// Search Console reported the result on 2026-09-17 as "Duplicate, Google chose
// different canonical than user".
//
// next.config.ts now redirects www to the apex, which is the fix. This test is
// the belt to that braces: a canonical tag is what holds the line if the
// redirect is ever removed, if another hostname is pointed here, or if a page
// picks up a tracking parameter. A new static page added to `staticPaths`
// without one fails here rather than in Search Console six weeks later.
//
// SOURCE IS READ AS TEXT rather than imported. app/sitemap.ts pulls in the
// WooCommerce snapshot, the Unleashed client and the Opinly SDK to build the
// product and blog halves; none of that is needed to answer "does this page
// file declare a canonical", and importing it to find out would make a unit
// test depend on the catalogue.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const APP = join(process.cwd(), "src/app");

function staticPaths(): string[] {
  const src = readFileSync(join(APP, "sitemap.ts"), "utf8");
  const block = src.match(/const staticPaths = \[([\s\S]*?)\];/);
  if (!block) throw new Error("staticPaths is no longer an array literal in app/sitemap.ts");
  return [...block[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

function pageSource(path: string): string {
  const file = join(APP, path, "page.tsx");
  if (!existsSync(file)) throw new Error(`${path} is in the sitemap and has no page.tsx`);
  return readFileSync(file, "utf8");
}

describe("sitemap static paths", () => {
  const paths = staticPaths();

  it("lists the pages it always has", () => {
    // A guard on the guard: a regex that silently matched nothing would make
    // every assertion below vacuous.
    expect(paths.length).toBeGreaterThanOrEqual(23);
    expect(paths).toContain("");
    expect(paths).toContain("/our-story");
  });

  it.each(paths)("%s declares its own canonical", (path) => {
    const src = pageSource(path);
    const canonical = src.match(/alternates:\s*\{\s*canonical:\s*"([^"]+)"/);
    expect(canonical, `${path}/page.tsx has no alternates.canonical`).not.toBeNull();
    // The canonical must be the path itself. A copy-paste that points one page
    // at another is worse than none: it deletes the page from the index on
    // purpose, which is what a wrong canonical asks for.
    expect(canonical![1]).toBe(path === "" ? "/" : path);
  });
});

// THE OTHER HALF OF THE SAME FIX. The canonical tags above say which URL a page
// is; this says the second hostname never serves the page in the first place.
describe("www.masterkraft.com", () => {
  it("redirects to the apex, before any other rule runs", async () => {
    const config = (await import("../../next.config")).default;
    const rules = await config.redirects!();
    const www = rules.find((r) => r.has?.some((h) => h.type === "host" && h.value?.includes("www")));
    expect(www, "no host-matched redirect for www").toBeDefined();
    // Order is the behaviour: every rule below this one has a relative
    // destination, so a www request that matched one of those first would be
    // sent to another www URL and need a second round trip to reach the apex.
    expect(rules.indexOf(www!)).toBe(0);
    expect(www!.source).toBe("/:path*");
    expect(www!.destination).toBe("https://masterkraft.com/:path*");
    expect(www!.permanent).toBe(true);
  });

  it("leaves the preview and staging hostnames alone", async () => {
    const config = (await import("../../next.config")).default;
    const rules = await config.redirects!();
    // A /^www\./ style rule would have caught these too. robots.txt is what
    // keeps them out of the index (lib/site.ts isIndexableHost); rewriting a
    // tester's hostname out from under them is not this rule's job.
    const hosts = rules.flatMap((r) => (r.has ?? []).filter((h) => h.type === "host").map((h) => h.value));
    expect(hosts).toEqual(["www.masterkraft.com"]);
  });
});
