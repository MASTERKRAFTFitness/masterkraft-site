// Every fixture here is real text that was live or scheduled on 23 September
// 2026. The rules are only worth having if they would have caught what nobody
// caught, so the tests are written against what actually happened rather than
// against invented examples.
import { describe, expect, it } from "vitest";
import { lintPost, type LintablePost } from "@/lib/content-rules";

const post = (over: Partial<LintablePost> = {}): LintablePost => ({
  slug: "a-post",
  title: "A Post",
  content: "",
  ...over,
});

const rules = (p: LintablePost) => lintPost(p).map((f) => f.rule);

describe("the spelling that came back twice", () => {
  it("catches Fit-Out in a title, which is how it reached three of them", () => {
    const found = lintPost(
      post({ title: "The Four-Phase Gym Fit-Out Process: Scope, Spec, Supply and Support Explained" })
    );
    expect(found.map((f) => f.rule)).toContain("spelling/fitout");
    expect(found.find((f) => f.rule === "spelling/fitout")!.field).toBe("title");
  });

  it("catches it in a slug, where it becomes a URL rather than an edit", () => {
    expect(
      rules(post({ slug: "the-four-phase-gym-fit-out-process-scope-spec-supply-and-support-explained" }))
    ).toContain("spelling/fitout");
  });

  it("catches the plural, which is what bodies mostly used", () => {
    expect(rules(post({ content: "Most commercial gym fit-outs do not fail because of a treadmill." })))
      .toContain("spelling/fitout");
  });

  // The rule has to survive this or it gets switched off.
  it("leaves 'fitting out' alone, because that is a verb and is correct", () => {
    expect(rules(post({ content: "Whether you are fitting out your first facility or your fifth." })))
      .not.toContain("spelling/fitout");
  });

  it("leaves the correct spelling alone", () => {
    expect(rules(post({ title: "The Four-Phase Gym Fitout Process", content: "a commercial gym fitout" })))
      .not.toContain("spelling/fitout");
  });
});

describe("Australian English", () => {
  it("flags standardized, which is in the 2 October post", () => {
    expect(
      rules(post({ content: "without a standardized regulatory framework mandating what it means" }))
    ).toContain("spelling/au-english");
  });

  // \w+ize would match "size", and a rule that cries wolf gets ignored.
  it("does not flag size, prize or capsize", () => {
    expect(rules(post({ content: "The size of the prize. The boat did not capsize." })))
      .not.toContain("spelling/au-english");
  });

  it("leaves -ise spellings alone", () => {
    expect(rules(post({ content: "selectorised machines, optimised for throughput" })))
      .not.toContain("spelling/au-english");
  });
});

describe("figures the post invented", () => {
  it("flags the startup range published under the MD's byline", () => {
    const found = lintPost(
      post({ content: "Mid-size independent gyms carry total startup costs of $150,000–$300,000." })
    );
    expect(found.map((f) => f.rule)).toContain("figures/unapproved");
    expect(found.find((f) => f.rule === "figures/unapproved")!.detail).toContain("$150,000");
  });

  it("flags a percentage claim", () => {
    expect(rules(post({ content: "equipment alone typically represents 30–50% of that figure" })))
      .toContain("figures/unapproved");
  });

  // The incident the whole rule exists for: no currency, no percent, just a
  // comma and a plus, and it reached seven published posts.
  it("flags a thousands-separated count like the CareLocate 30,000+", () => {
    expect(rules(post({ content: "Trusted by 30,000+ families across the country." })))
      .toContain("figures/unapproved");
  });

  // If the site's own numbers flagged, the report would be noise on every post.
  it("does not flag the figures the site itself states", () => {
    expect(
      rules(post({ content: "229 sites across 12 countries, with a 72-hour written SLA." }))
    ).not.toContain("figures/unapproved");
  });

  it("does not flag a standard, a gauge, a year or a duty cycle", () => {
    expect(
      rules(post({ content: "ISO 20957-1 Class S, 11-gauge steel, the 2015 Act, open 24/7." }))
    ).not.toContain("figures/unapproved");
  });
});

describe("image metadata", () => {
  const image = {
    alt: "Professional header image for educational tutorial: The Four-Phase Gym Fit-Out Process: Scope, Spec, Supply a...",
    title: "The Four-Phase Gym Fit-Out Process: Scope, Spec, Supply - commercial gym fitout Guide",
  };

  it("catches alt text that describes the prompt rather than the picture", () => {
    expect(rules(post({ image }))).toContain("image/alt-boilerplate");
  });

  it("catches alt text cut off mid-word", () => {
    expect(rules(post({ image }))).toContain("image/alt-truncated");
  });

  it("catches the keyword-stuffed title field", () => {
    expect(rules(post({ image }))).toContain("image/title-not-empty");
  });

  // The decision taken on 23 September: decorative header, empty alt, and the
  // title field cleared. That state has to lint clean or the rule is wrong.
  it("passes the agreed end state — empty alt, empty title", () => {
    expect(rules(post({ image: { alt: "", title: "" } }))).toEqual([]);
  });

  it("passes a real description of a real image", () => {
    expect(rules(post({ image: { alt: "A commercial gym floor with rigs and flooring installed", title: "" } })))
      .toEqual([]);
  });
});

describe("SEO lengths, against the site's own limit", () => {
  it("flags a meta title that will be cut in a search result", () => {
    expect(
      rules(post({ metaTitle: "Commercial Gym Equipment Australia: How to Spec the Right Grade for Your Facility" }))
    ).toContain("seo/meta-title-length");
  });

  it("leaves a short meta title alone", () => {
    expect(rules(post({ metaTitle: "The Four-Phase Gym Fitout Process Explained" })))
      .not.toContain("seo/meta-title-length");
  });
});

describe("a clean post", () => {
  it("produces nothing, so a green run means something", () => {
    expect(
      lintPost({
        slug: "the-four-phase-gym-fitout-process",
        title: "The Four-Phase Gym Fitout Process",
        metaTitle: "The Four-Phase Gym Fitout Process Explained",
        description: "Scope, Spec, Supply and Support, and why skipping a phase costs budget.",
        content: "A commercial gym fitout is not just equipment. 229 sites across 12 countries.",
        image: { alt: "", title: "" },
      })
    ).toEqual([]);
  });
});
