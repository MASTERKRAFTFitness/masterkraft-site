import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Svix webhook signature verification — the only thing standing between a public
 * endpoint and arbitrary cache invalidation on this site, which is why it lives
 * here with tests rather than inline in the route.
 *
 * Implemented directly rather than pulling in the `svix` package: the scheme is
 * one HMAC, and a dependency in the request path of a public endpoint is a
 * supply-chain surface that a dozen lines are not.
 *
 * node:crypto rather than Web Crypto (which lib/admin-auth uses) because that
 * module is imported by `proxy.ts` and has to run on the edge, and this one does
 * not — the route below is nodejs, where timingSafeEqual is a real
 * constant-time compare instead of a JavaScript approximation of one.
 */

/** How far a request's timestamp may be from now. Bounds replay attacks. */
export const TOLERANCE_SECONDS = 5 * 60;

/**
 * True when `signatureHeader` carries a valid v1 signature for this payload.
 *
 * HMAC-SHA256 over `${id}.${timestamp}.${body}`, keyed by the base64-decoded
 * body of the `whsec_` secret. The header may carry several space-separated
 * `v1,<sig>` entries during a secret rotation, so any one matching counts —
 * that is what lets a secret be rotated without dropping deliveries.
 */
export function verifySvixSignature(params: {
  secret: string;
  id: string;
  timestamp: string;
  signatureHeader: string;
  body: string;
  now?: number;
}): boolean {
  const { secret, id, timestamp, signatureHeader, body } = params;
  const now = params.now ?? Date.now();

  const sent = Number(timestamp);
  if (!timestamp.trim() || !Number.isFinite(sent)) return false;
  if (Math.abs(now / 1000 - sent) > TOLERANCE_SECONDS) return false;

  const rawKey = secret.startsWith("whsec_") ? secret.slice(6) : secret;

  let key: Buffer;
  try {
    key = Buffer.from(rawKey, "base64");
  } catch {
    // A malformed secret is a configuration fault, not a malformed request —
    // but it still must not authenticate anything.
    return false;
  }
  if (key.length === 0) return false;

  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  return signatureHeader
    .split(" ")
    .filter((part) => part.startsWith("v1,"))
    .some((part) => {
      const given = Buffer.from(part.slice(3), "base64");
      // timingSafeEqual throws on a length mismatch rather than returning false,
      // and a wrong-length signature is exactly what an attacker probing the
      // endpoint sends.
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}
