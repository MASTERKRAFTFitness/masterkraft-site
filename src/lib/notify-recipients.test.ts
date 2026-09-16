// The failure mode this guards is a form completed with nowhere to send it, or
// sent to nobody because one blank entry made Resend reject the whole call.
import { describe, it, expect } from "vitest";
import {
  DEFAULT_RECIPIENT,
  internalRecipients,
  primaryRecipient,
} from "@/lib/notify-recipients";

describe("internalRecipients", () => {
  it("splits a comma-separated list in order", () => {
    expect(internalRecipients("hello@masterkraft.com,marketing@masterkraft.com")).toEqual([
      "hello@masterkraft.com",
      "marketing@masterkraft.com",
    ]);
  });

  // Backwards compatibility: this variable held one address for 37 days before
  // it meant a list, and existing deployments must keep working untouched.
  it("still accepts a single address", () => {
    expect(internalRecipients("hello@masterkraft.com")).toEqual(["hello@masterkraft.com"]);
  });

  it("tolerates semicolons and whitespace", () => {
    expect(internalRecipients(" hello@masterkraft.com ; marketing@masterkraft.com ")).toEqual([
      "hello@masterkraft.com",
      "marketing@masterkraft.com",
    ]);
  });

  // A trailing comma is a typo. Passed through, Resend rejects the entire send
  // and the notification is lost — so the blank is dropped, not forwarded.
  it("drops blank entries rather than emailing the empty string", () => {
    expect(internalRecipients("hello@masterkraft.com,,")).toEqual(["hello@masterkraft.com"]);
    expect(internalRecipients(",")).toEqual([DEFAULT_RECIPIENT]);
  });

  // The same inbox twice means two copies of every brief.
  it("deduplicates case-insensitively", () => {
    expect(
      internalRecipients("hello@masterkraft.com,HELLO@masterkraft.com,marketing@masterkraft.com")
    ).toEqual(["hello@masterkraft.com", "marketing@masterkraft.com"]);
  });

  it("falls back when unset or empty", () => {
    expect(internalRecipients(undefined)).toEqual([DEFAULT_RECIPIENT]);
    expect(internalRecipients("")).toEqual([DEFAULT_RECIPIENT]);
    expect(internalRecipients("   ")).toEqual([DEFAULT_RECIPIENT]);
  });

  it("never returns an empty list", () => {
    for (const raw of [undefined, "", " ", ",", ";;", " , ; "]) {
      expect(internalRecipients(raw).length).toBeGreaterThan(0);
    }
  });
});

describe("primaryRecipient", () => {
  // A Reply-To naming everyone turns a customer's reply into a group thread and
  // leaks the internal list to them, so the confirmation replies to one inbox.
  it("is the first address, not the whole list", () => {
    expect(primaryRecipient("hello@masterkraft.com,marketing@masterkraft.com")).toBe(
      "hello@masterkraft.com"
    );
  });

  it("falls back with the rest", () => {
    expect(primaryRecipient(undefined)).toBe(DEFAULT_RECIPIENT);
  });
});
