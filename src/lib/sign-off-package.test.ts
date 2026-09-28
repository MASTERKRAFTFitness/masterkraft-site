// The fixtures are the September posts, with the statuses they actually had on
// 28 September: five held, three live, two slots already passed while waiting.
import { describe, expect, it } from "vitest";
import { buildPackage, renderMarkdown, type SignOffInput } from "@/lib/sign-off-package";

const NOW = new Date("2026-09-28T04:00:00.000Z");

const costToOpen: SignOffInput = {
  id: "post_hRBqeFByjqTdS9z51Waz9",
  slug: "what-it-actually-costs-to-open-a-gym-in-australia",
  title: "What It Actually Costs to Open a Gym in Australia",
  status: "scheduled_review",
  scheduledAt: "2026-09-26T01:00:00.000Z",
  author: "Steve Callanan",
  content: "Mid-size independent gyms carry total startup costs of $150,000–$300,000; equipment is 30–50% of that.",
  image: { alt: "", title: "" },
};

const nzFitout: SignOffInput = {
  id: "post_gm1Kt_OH9EvHKv8j3w7Ii",
  slug: "commercial-gym-fitout-in-new-zealand",
  title: "Commercial Gym Fitout in New Zealand",
  status: "scheduled_review",
  scheduledAt: "2026-09-29T01:00:00.000Z",
  author: "Steve Callanan",
  content: "The import window is the fixed anchor of the project schedule.",
  image: { alt: "", title: "" },
};

const fourPhase: SignOffInput = {
  id: "post_TE-6OlcWLeTyJ088nE8i9",
  slug: "the-four-phase-gym-fitout-process",
  title: "The Four-Phase Gym Fitout Process",
  status: "published",
  publishedAt: "2026-09-23T01:04:06.000Z",
  author: "Steve Callanan",
  content: "A commercial gym fitout is not just equipment.",
  image: { alt: "", title: "" },
};

const pkg = () => buildPackage([fourPhase, nzFitout, costToOpen], { client: "MasterKraft", now: NOW });

describe("what the package counts", () => {
  it("separates what is waiting on a person from what is already live", () => {
    const s = pkg().summary;
    expect(s.items).toBe(3);
    expect(s.awaitingSignOff).toBe(2);
    expect(s.live).toBe(1);
  });

  // The cost of the delay, as a number rather than a feeling. The 26 September
  // slot passed while the post sat held.
  it("counts slots that passed while waiting", () => {
    expect(pkg().summary.missedSlots).toBe(1);
  });

  it("does not count a slot that has not arrived yet", () => {
    const only = buildPackage([nzFitout], { client: "MasterKraft", now: NOW });
    expect(only.summary.missedSlots).toBe(0);
  });

  // A published post cannot miss a slot, whatever its dates say.
  it("does not count a live post as missing anything", () => {
    const only = buildPackage([fourPhase], { client: "MasterKraft", now: NOW });
    expect(only.summary.missedSlots).toBe(0);
    expect(only.summary.awaitingSignOff).toBe(0);
  });
});

describe("the order a reviewer should work in", () => {
  it("puts held posts first, soonest slot first", () => {
    expect(pkg().items.map((i) => i.slug)).toEqual([
      "what-it-actually-costs-to-open-a-gym-in-australia",
      "commercial-gym-fitout-in-new-zealand",
      "the-four-phase-gym-fitout-process",
    ]);
  });
});

describe("what approving commits to", () => {
  // The line that carries the thing a reviewer would regret not knowing.
  it("names the money, and whose byline it goes out under", () => {
    const item = pkg().items.find((i) => i.slug.startsWith("what-it"))!;
    const said = item.commitsTo.join(" ");
    expect(said).toContain("$150,000");
    expect(said).toContain("Steve Callanan");
  });

  it("says so plainly when the checks found nothing", () => {
    const item = pkg().items.find((i) => i.slug === "the-four-phase-gym-fitout-process")!;
    expect(item.commitsTo.join(" ")).toContain("judgement about the writing");
    expect(item.findings).toEqual([]);
  });

  it("calls out alt text a screen reader would read aloud", () => {
    const bad = buildPackage(
      [{ ...nzFitout, image: { alt: "Professional header image for industry analysis: Commercial...", title: "" } }],
      { client: "MasterKraft", now: NOW }
    );
    expect(bad.items[0].commitsTo.join(" ")).toContain("screen reader");
  });
});

describe("it hands over, it does not decide", () => {
  it("leaves every decision null", () => {
    expect(pkg().items.every((i) => i.decision === null)).toBe(true);
  });
});

describe("the readable version", () => {
  it("leads with what is waiting and the slots already lost", () => {
    const md = renderMarkdown(pkg());
    expect(md).toContain("**2 awaiting sign-off**");
    expect(md).toContain("1 scheduled slot");
    expect(md).toContain("need a new date");
  });

  it("says plainly that nothing here is published", () => {
    expect(renderMarkdown(pkg())).toContain("Nothing here is published");
  });

  it("gives every item a decision box", () => {
    const md = renderMarkdown(pkg());
    expect(md.match(/\*\*Decision:\*\*/g)).toHaveLength(3);
  });
});
