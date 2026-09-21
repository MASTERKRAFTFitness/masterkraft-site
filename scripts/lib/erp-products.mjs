// Read every page of Unleashed's /Products, without knocking it over.
//
// WHY THIS EXISTS, 2026-09-18. build-obsolete-skus.mjs and build-erp-cartons.mjs
// each carried an identical copy of this:
//
//   await Promise.all(Array.from({ length: pages - 1 }, (_, i) => page(i + 2)))
//
// Twelve simultaneous requests at an API both scripts' own header comments
// describe as one that "answers slowly and throttles concurrency". On 18 Sep it
// did what that invites: 502 on page 6, then on a second run 502 on page 7, and
// `npm run deploy` refused twice over an ERP hiccup that had nothing to do with
// the release being shipped. A deploy gate that fails for reasons unrelated to
// the deploy is one people learn to bypass, which is how the gate stops working
// at the only moment it matters.
//
// The same thirteen pages fetched ONE AT A TIME all answered 200 while that was
// happening — including one that took 99 seconds. Unleashed was degraded, not
// down, and sequential reads rode straight through it.
//
// SEQUENTIAL IS THE POINT, not an implementation detail. Do not "optimise" this
// back into a parallel map. A full pass costs roughly two minutes against a
// healthy ERP, which is a rounding error on a deploy and the difference between
// a gate that works and one that lies.
import crypto from "node:crypto";

/** 502/503/504 and 429 are "ask again"; a 401 or a 404 is not. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** Backoff between attempts, in ms. Four attempts, then give up honestly. */
const BACKOFF = [2_000, 6_000, 15_000];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One page, with retries on the failures that are worth retrying.
 *
 * A retry that hides a permanent fault is worse than no retry at all, so 4xx
 * other than 429 fails immediately: a bad signature does not get better by being
 * asked four times, and burning 23 seconds before reporting it helps nobody.
 */
async function fetchPage(n, { apiId, apiKey, query, log }) {
  let lastError;
  for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
    if (attempt > 0) {
      const wait = BACKOFF[attempt - 1];
      log?.(`  page ${n}: ${lastError}, retrying in ${wait / 1000}s (attempt ${attempt + 1})`);
      await sleep(wait);
    }
    try {
      const res = await fetch(`https://api.unleashedsoftware.com/Products/${n}?${query}`, {
        headers: {
          "api-auth-id": apiId,
          // The signature covers the query string exactly as sent.
          "api-auth-signature": crypto.createHmac("sha256", apiKey).update(query).digest("base64"),
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0", // Unleashed's WAF rejects some default agents
        },
      });
      if (res.ok) return res.json();
      lastError = `Unleashed ${res.status}`;
      if (!RETRYABLE.has(res.status)) {
        throw new Error(`${lastError} on Products/${n} — not retryable, giving up.`);
      }
    } catch (e) {
      // A socket error reads as retryable; a thrown non-retryable status does not.
      if (e instanceof Error && e.message.includes("not retryable")) throw e;
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(
    `Unleashed failed on Products/${n} after ${BACKOFF.length + 1} attempts (${lastError}).\n` +
      `This is the ERP, not the code being deployed. Try again in a few minutes.`
  );
}

/**
 * Every product Unleashed holds, obsolete ones included.
 *
 * `includeObsolete=true` is not optional and both callers depend on it: GET
 * /Products hides retired records by default, which reads as "this company never
 * uses the flag" rather than "you asked the wrong question".
 */
export async function fetchAllProducts({ apiId, apiKey, log } = {}) {
  const query = "pageSize=200&includeObsolete=true";
  const opts = { apiId, apiKey, query, log };

  const first = await fetchPage(1, opts);
  const pages = first.Pagination?.NumberOfPages ?? 1;
  const items = [...first.Items];

  for (let n = 2; n <= pages; n++) {
    const body = await fetchPage(n, opts);
    items.push(...body.Items);
  }

  return { items, pages };
}
