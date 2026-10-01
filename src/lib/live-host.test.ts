import { describe, expect, it } from "vitest";
import { isLiveHost } from "@/lib/live-host";

describe("isLiveHost", () => {
  it("is on for the public domain", () => {
    expect(isLiveHost("masterkraft.com")).toBe(true);
    expect(isLiveHost("www.masterkraft.com")).toBe(true);
    expect(isLiveHost("WWW.MasterKraft.com")).toBe(true);
  });

  it("is off for local, preview and lookalike hosts", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "masterkraft-site-abc123-masterkraft.vercel.app",
      "shop.masterkraft.com",
      "masterkraft.com.evil.test",
      "",
    ]) {
      expect(isLiveHost(host)).toBe(false);
    }
  });

  it("is off on the server, where there is no window", () => {
    expect(isLiveHost()).toBe(false);
  });
});
