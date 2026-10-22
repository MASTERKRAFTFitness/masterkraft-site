import { describe, expect, it } from "vitest";
import {
  PRICE_EXAMPLES,
  PRICING_CONFIRMED,
  savingPct,
  formatClose,
  formatLanding,
  upcomingWindows,
  windowFromLabel,
  windowLabel,
} from "./indie-iron";

// The calendar the brief signed off (doc 64, section 4). The page computes it
// from dates rather than hard-coding it, so these pin the computation to it.
describe("Indie Iron buy windows", () => {
  it("shows the next four rounds on the brief's date, founding round first", () => {
    const w = upcomingWindows(new Date("2026-10-19T00:00:00Z"));
    expect(w.map((x) => x.name)).toEqual(["Founding round", "Autumn", "Winter", "Spring"]);
    expect(w.map(formatClose)).toEqual([
      "Sun 15 Nov 2026",
      "Mon 15 Feb 2027",
      "Sat 15 May 2027",
      "Sun 15 Aug 2027",
    ]);
    expect(w.map(formatLanding)).toEqual([
      "27 Dec 2026 – 10 Jan 2027",
      "29 Mar – 12 Apr 2027",
      "26 Jun – 10 Jul 2027",
      "26 Sep – 10 Oct 2027",
    ]);
  });

  it("closes at 23:59 Melbourne time: AEDT in November, AEST in May", () => {
    const [nov] = upcomingWindows(new Date("2026-10-19T00:00:00Z"));
    expect(nov.closesAt.toISOString()).toBe("2026-11-15T12:59:00.000Z");
    const may = upcomingWindows(new Date("2027-03-01T00:00:00Z"))[0];
    expect(may.name).toBe("Winter");
    expect(may.closesAt.toISOString()).toBe("2027-05-15T13:59:00.000Z");
  });

  it("rolls to the next round a minute after the close", () => {
    expect(upcomingWindows(new Date("2026-11-15T12:58:00Z"))[0].name).toBe("Founding round");
    const after = upcomingWindows(new Date("2026-11-15T13:00:00Z"));
    expect(after.map((x) => x.name)).toEqual(["Autumn", "Winter", "Spring", "Summer"]);
    expect(formatLanding(after[3])).toBe("27 Dec 2027 – 10 Jan 2028");
  });

  it("only names the first round 'Founding round'", () => {
    const w = upcomingWindows(new Date("2027-09-01T00:00:00Z"));
    expect(w[0].name).toBe("Summer");
    expect(windowLabel(w[0])).toBe("Summer (closes 15 Nov 2027)");
  });
});

// Member = the T6 tier (10% off the website), buying group = the T4 tier (the
// 20% tier). Michael, 19 Oct 2026. Prices from Unleashed, 14 Oct 2026.
describe("Indie Iron member pricing (draft)", () => {
  it("prices the 20 kg bumper at T6 for members and T4 in the buying group", () => {
    const bumper = PRICE_EXAMPLES.find((p) => p.line === "Plates")!;
    expect([bumper.website, bumper.member, bumper.group]).toEqual([225, 202.5, 180]);
  });

  it("keeps every example in order: website > member > buying group", () => {
    for (const p of PRICE_EXAMPLES) {
      expect(p.member, p.item).toBeLessThan(p.website);
      expect(p.group, p.item).toBeLessThan(p.member);
      expect(savingPct(p.website, p.member), p.item).toBe(10);
    }
  });

  it("is live, so the page's 'up to' claim must match the deepest saving", () => {
    expect(PRICING_CONFIRMED).toBe(true);
    const deepest = Math.max(...PRICE_EXAMPLES.map((p) => savingPct(p.website, p.group)));
    expect(deepest).toBe(20); // the hero, facts and callout say "up to 20%"
  });
});

describe("windowFromLabel", () => {
  it("round-trips every label the form can submit", () => {
    for (const w of upcomingWindows(new Date("2026-10-19T00:00:00Z"), 8)) {
      expect(windowFromLabel(windowLabel(w))).toEqual(w);
    }
  });

  it("closes at 23:59 Melbourne time", () => {
    expect(windowFromLabel("Founding round (closes 15 Nov 2026)")?.closesAt.toISOString()).toBe("2026-11-15T12:59:00.000Z");
    expect(windowFromLabel("Winter (closes 15 May 2027)")?.closesAt.toISOString()).toBe("2027-05-15T13:59:00.000Z");
  });

  it("returns null for anything that is not a real window", () => {
    for (const bad of ["", "Not sure", "Autumn (closes 15 Mar 2027)", "Summer (closes 15 Feb 2027)", "Autumn (closes 14 Feb 2027)"]) {
      expect(windowFromLabel(bad), bad).toBeNull();
    }
  });
});
