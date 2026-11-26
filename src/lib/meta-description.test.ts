import { describe, it, expect } from "vitest";
import { DESCRIPTION_MAX, DESCRIPTION_MIN, fitDescription, padDescription } from "./meta-description";

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

describe("padDescription", () => {
  const tail = "Wholesale pricing available to qualifying trade customers.";

  it("leaves a description that is long enough alone", () => {
    const text = "Twelve competition kettlebells totalling 250kg, supplied with a rack for a commercial floor.";
    expect(padDescription(text, tail)).toBe(text);
  });

  it("tops up one under the floor", () => {
    const out = padDescription("Buy Pro Bumper Plates at MASTERKRAFT. $64.00 inc. GST.", tail)!;
    expect(out).toBe(`Buy Pro Bumper Plates at MASTERKRAFT. $64.00 inc. GST. ${tail}`);
    expect(out.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
  });

  it("still fits the result to a snippet", () => {
    const out = padDescription("A compact studio.", "x ".repeat(200))!;
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("passes nothing through as nothing", () => {
    expect(padDescription(undefined, tail)).toBeUndefined();
  });
});
