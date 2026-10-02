// The attribution checks on what the browser reports. A value that slips through
// mislabels a lead in the CRM; a real one that is wrongly rejected loses the
// paid-social source, which is the reason these exist.
import { describe, it, expect } from "vitest";
import { cleanHutk, cleanPageUri } from "@/lib/hubspot";

describe("cleanHutk", () => {
  it("keeps a HubSpot visitor token", () => {
    expect(cleanHutk("4f7c2b1e9d8a6b5c4d3e2f1a0b9c8d7e")).toBe("4f7c2b1e9d8a6b5c4d3e2f1a0b9c8d7e");
  });

  it("drops anything that is not a 32-character hex token", () => {
    expect(cleanHutk(null)).toBeUndefined();
    expect(cleanHutk("")).toBeUndefined();
    expect(cleanHutk("not-a-token")).toBeUndefined();
    expect(cleanHutk("4f7c2b1e9d8a6b5c4d3e2f1a0b9c8d7e00")).toBeUndefined();
  });
});

describe("cleanPageUri", () => {
  const path = "/fitout-solution";

  it("keeps the live page with its UTM tags and fbclid", () => {
    const url =
      "https://masterkraft.com/fitout-solution?utm_source=instagram&utm_medium=paid_social&utm_campaign=fitout-wizard&fbclid=abc";
    expect(cleanPageUri(url, path)).toBe(url);
  });

  it("accepts www and a trailing slash, and drops the fragment", () => {
    expect(cleanPageUri("https://www.masterkraft.com/fitout-solution/?utm_source=ig#brief", path)).toBe(
      "https://www.masterkraft.com/fitout-solution/?utm_source=ig"
    );
  });

  it("falls back to the bare path off the live domain or page", () => {
    expect(cleanPageUri("https://masterkraft-site-pi.vercel.app/fitout-solution", path)).toBe(path);
    expect(cleanPageUri("http://localhost:3000/fitout-solution", path)).toBe(path);
    expect(cleanPageUri("https://masterkraft.com/contact", path)).toBe(path);
    expect(cleanPageUri("http://masterkraft.com/fitout-solution", path)).toBe(path);
    expect(cleanPageUri("not a url", path)).toBe(path);
    expect(cleanPageUri(null, path)).toBe(path);
    expect(cleanPageUri(`https://masterkraft.com/fitout-solution?x=${"a".repeat(2100)}`, path)).toBe(path);
  });
});
