// The Opinly publish webhook's signature check.
//
// This is the only guard on a PUBLIC endpoint that can invalidate the blog's
// entire cache, so the interesting cases are the ones that must FAIL. A bug that
// makes verification too permissive does not break anything visibly — it just
// quietly means anyone who finds the URL can make the site re-fetch the whole
// blog on demand.
import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifySvixSignature, TOLERANCE_SECONDS } from "@/lib/opinly-webhook";

const SECRET = `whsec_${Buffer.from("a-test-signing-secret-32-bytes!!").toString("base64")}`;
const ID = "msg_2abc";
const BODY = JSON.stringify({ type: "content.routes-changed" });

/** What Svix would send for this payload at `sentAt` (seconds). */
function sign(sentAt: number, body = BODY, secret = SECRET) {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const mac = createHmac("sha256", key).update(`${ID}.${sentAt}.${body}`).digest("base64");
  return `v1,${mac}`;
}

describe("verifySvixSignature", () => {
  const now = 1_760_000_000_000; // fixed clock; the check is time-sensitive
  const sentAt = Math.floor(now / 1000);

  it("accepts a correctly signed, current request", () => {
    expect(
      verifySvixSignature({
        secret: SECRET,
        id: ID,
        timestamp: String(sentAt),
        signatureHeader: sign(sentAt),
        body: BODY,
        now,
      }),
    ).toBe(true);
  });

  it("accepts when one of several rotated signatures matches", () => {
    // Svix sends every active secret's signature during a rotation. Requiring
    // the first to match would drop deliveries for the whole overlap window.
    const header = `v1,AAAAnotarealsignature ${sign(sentAt)}`;
    expect(
      verifySvixSignature({
        secret: SECRET,
        id: ID,
        timestamp: String(sentAt),
        signatureHeader: header,
        body: BODY,
        now,
      }),
    ).toBe(true);
  });

  it("rejects a body that changed after signing", () => {
    // The whole point: the signature covers the payload, not just the headers.
    expect(
      verifySvixSignature({
        secret: SECRET,
        id: ID,
        timestamp: String(sentAt),
        signatureHeader: sign(sentAt),
        body: JSON.stringify({ type: "content.routes-changed", extra: "injected" }),
        now,
      }),
    ).toBe(false);
  });

  it("rejects a replay from outside the tolerance window", () => {
    const old = sentAt - TOLERANCE_SECONDS - 1;
    expect(
      verifySvixSignature({
        secret: SECRET,
        id: ID,
        timestamp: String(old),
        signatureHeader: sign(old),
        body: BODY,
        now,
      }),
    ).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const other = `whsec_${Buffer.from("a-different-secret-of-32-bytes!!!").toString("base64")}`;
    expect(
      verifySvixSignature({
        secret: SECRET,
        id: ID,
        timestamp: String(sentAt),
        signatureHeader: sign(sentAt, BODY, other),
        body: BODY,
        now,
      }),
    ).toBe(false);
  });

  it("rejects a wrong-length signature instead of throwing", () => {
    // timingSafeEqual throws on a length mismatch, and a short signature is
    // exactly what a probe sends. A 500 here would be an availability bug.
    expect(() =>
      verifySvixSignature({
        secret: SECRET,
        id: ID,
        timestamp: String(sentAt),
        signatureHeader: "v1,QUJD",
        body: BODY,
        now,
      }),
    ).not.toThrow();
    expect(
      verifySvixSignature({
        secret: SECRET,
        id: ID,
        timestamp: String(sentAt),
        signatureHeader: "v1,QUJD",
        body: BODY,
        now,
      }),
    ).toBe(false);
  });

  it("rejects a non-numeric or empty timestamp", () => {
    for (const timestamp of ["", "   ", "not-a-number"]) {
      expect(
        verifySvixSignature({
          secret: SECRET,
          id: ID,
          timestamp,
          signatureHeader: sign(sentAt),
          body: BODY,
          now,
        }),
      ).toBe(false);
    }
  });

  it("rejects an empty secret rather than authenticating everything", () => {
    expect(
      verifySvixSignature({
        secret: "whsec_",
        id: ID,
        timestamp: String(sentAt),
        signatureHeader: sign(sentAt),
        body: BODY,
        now,
      }),
    ).toBe(false);
  });

  it("ignores signature entries that are not v1", () => {
    expect(
      verifySvixSignature({
        secret: SECRET,
        id: ID,
        timestamp: String(sentAt),
        signatureHeader: `v2,${sign(sentAt).slice(3)}`,
        body: BODY,
        now,
      }),
    ).toBe(false);
  });
});
