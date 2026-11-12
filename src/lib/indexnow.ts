// INDEXNOW: telling Bing (and Yandex, Seznam, Naver …) the moment a URL changes.
//
// Google does not take part; Search Console and the sitemap are its channel.
// Bing does, and Bing's index is what Copilot and ChatGPT's search read from,
// which is most of why this is worth having: the 10 Nov Rankability audit found
// MasterKraft in 0 of 11 AI answers for "best commercial gym equipment".
//
// THE KEY IS PUBLIC BY DESIGN. The protocol proves we own the host by serving
// the key at /<key>.txt (public/7e050e9cdb80d82f8271957656b67fd9.txt); anyone
// may read it. It authorises nothing but submitting our own URLs.
//
// PRODUCTION ONLY, and on masterkraft.com only. A preview deploy or a laptop
// telling Bing that masterkraft.com changed would be false, and the key file a
// preview serves is on a host Bing will not match against.

import { SITE_URL } from "@/lib/site";

export const INDEXNOW_KEY = "7e050e9cdb80d82f8271957656b67fd9";
const ENDPOINT = "https://api.indexnow.org/indexnow";
/** The protocol's ceiling per request. */
export const INDEXNOW_BATCH = 10_000;

export function indexNowEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production" && new URL(SITE_URL).hostname === "masterkraft.com";
}

/**
 * Submit URLs on this site. Never throws: a ping that fails costs a few hours
 * of freshness on Bing, never a publish. Returns the HTTP status, or a reason
 * it did not send.
 */
export async function submitToIndexNow(urls: string[]): Promise<number | "disabled" | "empty" | "failed"> {
  if (!indexNowEnabled()) return "disabled";
  const host = new URL(SITE_URL).hostname;
  const own = [...new Set(urls)].filter((u) => {
    try {
      return new URL(u).hostname === host;
    } catch {
      return false;
    }
  });
  if (!own.length) return "empty";
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: own.slice(0, INDEXNOW_BATCH),
      }),
    });
    console.log(`[indexnow] ${res.status} for ${own.length} url(s)`);
    return res.status;
  } catch (e) {
    console.error("[indexnow] submit failed", e);
    return "failed";
  }
}
