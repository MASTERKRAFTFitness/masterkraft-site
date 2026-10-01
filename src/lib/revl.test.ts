import { describe, expect, it } from "vitest";
import { revlClubsAu, revlSites } from "./revl";

describe("revlClubsAu", () => {
  it("links every fit out to a real /revl-fitouts page", () => {
    const slugs = new Set(revlSites.map((s) => s.slug));
    const broken = revlClubsAu.filter((c) => c.fitout && !slugs.has(c.fitout));
    expect(broken).toEqual([]);
  });
});
