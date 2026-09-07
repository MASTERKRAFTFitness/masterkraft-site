// Guards the one flag that, set wrongly, gets staging indexed alongside the
// real site. Each case reloads the module because SITE_URL and ALLOW_INDEX are
// read at import time.
import { describe, it, expect, afterEach, vi } from "vitest";

async function withEnv(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/site");
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ALLOW_INDEX;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  vi.resetModules();
});

describe("absoluteUrl", () => {
  const live = { NEXT_PUBLIC_SITE_URL: "https://masterkraft.com" };

  it("qualifies the mirror's bare product-image paths", async () => {
    const { absoluteUrl } = await withEnv(live);
    // The exact shape the JSON-LD was emitting relative before this existed.
    expect(absoluteUrl("/product-images/AMBXPBG03-1.jpg")).toBe(
      "https://masterkraft.com/product-images/AMBXPBG03-1.jpg",
    );
    expect(absoluteUrl("product-images/AMBXPBG03-1.jpg")).toBe(
      "https://masterkraft.com/product-images/AMBXPBG03-1.jpg",
    );
    // No doubled slash where the path already carries one.
    expect(absoluteUrl("//product-images/x.jpg")).not.toContain("masterkraft.com//");
  });

  it("leaves absolute URLs alone", async () => {
    const { absoluteUrl } = await withEnv(live);
    // Variant photography is the Unleashed CDN's; prefixing it would 404.
    const cdn = "https://unlappcdn.unleashedsoftware.com/x.jpg";
    expect(absoluteUrl(cdn)).toBe(cdn);
    expect(absoluteUrl("http://example.test/x.jpg")).toBe("http://example.test/x.jpg");
    expect(absoluteUrl("HTTPS://example.test/x.jpg")).toBe("HTTPS://example.test/x.jpg");
    expect(absoluteUrl("//cdn.example.test/x.jpg")).toBe("https://cdn.example.test/x.jpg");
  });

  it("returns empty for nothing, so the caller can filter it out", async () => {
    const { absoluteUrl } = await withEnv(live);
    expect(absoluteUrl("")).toBe("");
    expect(absoluteUrl(undefined)).toBe("");
    expect(absoluteUrl(null)).toBe("");
  });

  it("follows SITE_URL to whatever host the deployment answers on", async () => {
    const { absoluteUrl } = await withEnv({
      NEXT_PUBLIC_SITE_URL: "https://web.test.masterkraft.com",
    });
    expect(absoluteUrl("/product-images/x.jpg")).toBe(
      "https://web.test.masterkraft.com/product-images/x.jpg",
    );
  });
});

describe("isIndexableHost", () => {
  const live = { NEXT_PUBLIC_ALLOW_INDEX: "true", NEXT_PUBLIC_SITE_URL: "https://masterkraft.com" };

  it("indexes the canonical apex and its www form", async () => {
    const { isIndexableHost } = await withEnv(live);
    expect(isIndexableHost("masterkraft.com")).toBe(true);
    expect(isIndexableHost("www.masterkraft.com")).toBe(true);
    expect(isIndexableHost("MasterKraft.com")).toBe(true);
    expect(isIndexableHost("masterkraft.com:3000")).toBe(true);
  });

  it("never indexes staging or preview hosts, even with the flag on", async () => {
    const { isIndexableHost } = await withEnv(live);
    expect(isIndexableHost("web.test.masterkraft.com")).toBe(false);
    expect(isIndexableHost("masterkraft-site-abc123.vercel.app")).toBe(false);
    expect(isIndexableHost("localhost")).toBe(false);
    // Not a subdomain trick either.
    expect(isIndexableHost("masterkraft.com.evil.test")).toBe(false);
  });

  it("blocks everything when the flag is off", async () => {
    const { isIndexableHost } = await withEnv({ ...live, NEXT_PUBLIC_ALLOW_INDEX: undefined });
    expect(isIndexableHost("masterkraft.com")).toBe(false);
  });

  it("fails closed on a missing host or a malformed SITE_URL", async () => {
    const { isIndexableHost } = await withEnv(live);
    expect(isIndexableHost(null)).toBe(false);
    expect(isIndexableHost("")).toBe(false);
    const bad = await withEnv({ ...live, NEXT_PUBLIC_SITE_URL: "not-a-url" });
    expect(bad.isIndexableHost("masterkraft.com")).toBe(false);
  });
});
