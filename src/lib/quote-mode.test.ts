// Quote-only mode has to hold for a caller that never loaded the page.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { quoteOnlyMode } from "@/lib/stripe";

const env = { ...process.env };
beforeEach(() => delete process.env.NEXT_PUBLIC_CHECKOUT_MODE);
afterEach(() => { process.env = { ...env }; });

describe("quote-only mode is a server rule too", () => {
  it("is off by default, so normal service is unaffected", () => {
    expect(quoteOnlyMode()).toBe(false);
  });

  it("is on when the site is in quote mode", () => {
    process.env.NEXT_PUBLIC_CHECKOUT_MODE = "quote";
    expect(quoteOnlyMode()).toBe(true);
  });

  it("treats an explicit card mode as normal service", () => {
    process.env.NEXT_PUBLIC_CHECKOUT_MODE = "card";
    expect(quoteOnlyMode()).toBe(false);
  });

  // The client gate is `!!key && mode === "card"`. This one deliberately does
  // NOT look at the key: a route with live keys and quote mode set is exactly
  // the case worth refusing, and it is the case production is in today.
  it("refuses regardless of whether keys are configured", () => {
    process.env.NEXT_PUBLIC_CHECKOUT_MODE = "quote";
    process.env.STRIPE_SECRET_KEY = "sk_live_example";
    expect(quoteOnlyMode()).toBe(true);
  });
});
