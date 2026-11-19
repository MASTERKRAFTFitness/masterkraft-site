import { describe, it, expect } from "vitest";
import { DESCRIPTION_MAX, fitDescription } from "./meta-description";

describe("fitDescription", () => {
  it("leaves a description that fits alone", () => {
    expect(fitDescription("A preacher bench for strict curls.")).toBe("A preacher bench for strict curls.");
    expect(fitDescription(undefined)).toBeUndefined();
  });

  it("cuts at the last sentence end inside the limit", () => {
    const first = "The rack is built from 75x75mm steel uprights and takes every attachment in the range we sell.";
    const text = `${first} It ships flat-packed with a full bolt kit and an assembly guide, and installs in an afternoon with two people.`;
    expect(text.length).toBeGreaterThan(DESCRIPTION_MAX);
    expect(fitDescription(text)).toBe(first);
  });

  it("falls back to a word boundary and an ellipsis when no sentence end is usable", () => {
    const text = "word ".repeat(60).trim();
    const out = fitDescription(text)!;
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(out.endsWith("word…")).toBe(true);
  });

  it("does not cut so early that almost nothing is left", () => {
    const text = `Short one. ${"and then a very long clause that keeps going ".repeat(5)}`;
    const out = fitDescription(text)!;
    expect(out.length).toBeGreaterThan(100);
    expect(out.endsWith("…")).toBe(true);
  });
});
