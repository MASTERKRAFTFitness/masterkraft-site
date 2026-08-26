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
