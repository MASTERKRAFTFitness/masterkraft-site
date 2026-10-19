import { describe, expect, it } from "vitest";
import { formatClose, formatLanding, upcomingWindows, windowLabel } from "./indie-iron";

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
