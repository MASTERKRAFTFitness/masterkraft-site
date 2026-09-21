// Make an edit to product_content show up now, instead of within the hour.
//
// WHY THIS EXISTS. lib/product-content.ts caches the whole table for 3600s and
// tags it "product-content". Nothing dropped that tag until this route, so an
// editor who fixed a warranty in Supabase saw no change for up to an hour. That
// is not a slow feature, it is a broken one: the realistic reaction to "my edit
// did nothing" is to edit it again, and now two people disagree about what the
// page says. The whole point of moving copy out of a committed JSON file was
// that somebody other than an engineer could change it, and a change you cannot
// see is not a change you can make.
//
// TAG AND PATH, BOTH, EVERY TIME. api/opinly/route.ts learned this the hard
// way and its note is worth repeating: revalidateTag clears the cached DATA but
// leaves already-rendered HTML in the full-route cache, so the page keeps
// serving the old body. revalidatePath does the mirror-image half. One without
// the other looks like it works — on a cold page.
//
// `{ expire: 0 }` is the second argument, not the named profile 'max'. Next 16
// requires the argument, and 'max' is stale-while-revalidate: it keeps serving
// the OLD copy to everyone who arrives before the first visitor's background
// fetch finishes. On a long-tail product page that visitor may be hours away.
// An edit webhook exists to make the new version live now.
//
// TWO CONSUMERS, NOT ONE. The product page is the obvious one. merchant-feed.xml
// also calls getProductContent — it is the Google Shopping feed, and a product
// title or description that disagrees with the landing page is a disapproval
// risk, so it is revalidated alongside rather than left to age out.
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

export const dynamic = "force-dynamic";

/** The tag lib/product-content.ts caches under. Must match it exactly. */
const TAG = "product-content";
/** The feed also reads product_content, so an edit invalidates it too. */
const FEED = "/merchant-feed.xml";

/**
 * FAIL CLOSED, the same reasoning as api/cron/erp-mirror. A route that can flush
 * the site's content cache on demand is a cheap denial-of-service if it is left
 * open because a variable was forgotten — every call forces the next render to
 * re-read Supabase.
 */
function authorised(req: Request): { ok: true } | { ok: false; status: number; why: string } {
  const secret = process.env.CONTENT_REVALIDATE_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: 503,
      why: "CONTENT_REVALIDATE_SECRET is not set on this deployment, so this route refuses to run. Set it in Vercel and redeploy.",
    };
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, why: "Unauthorised." };
  }
  return { ok: true };
}

/**
 * Every slug this request should re-render, from either shape of caller.
 *
 * A Supabase database webhook sends `{ record, old_record }`. BOTH matter: if an
 * edit changed the slug, the page at the OLD address has to be re-rendered too
 * or it keeps serving content that has moved. A person or a script sends
 * `{ slugs: [...] }`.
 */
function slugsFrom(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  const out = new Set<string>();

  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.add(v.trim());
  };

  if (Array.isArray(b.slugs)) b.slugs.forEach(add);
  for (const key of ["record", "old_record"]) {
    const rec = b[key];
    if (rec && typeof rec === "object") add((rec as Record<string, unknown>).slug);
  }
  return [...out];
}

export async function POST(req: Request) {
  const auth = authorised(req);
  if (!auth.ok) {
    console.warn(`[revalidate/product-content] refused: ${auth.why}`);
    return NextResponse.json({ ok: false, error: auth.why }, { status: auth.status });
  }

  // A malformed body is not a reason to do nothing. The tag is the half that
  // matters most and needs no slug at all, so parse failures degrade to
  // "flush the data cache" rather than to a 400 an editor cannot interpret.
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const slugs = slugsFrom(body);

  revalidateTag(TAG, { expire: 0 });
  for (const slug of slugs) revalidatePath(`/product/${slug}`);
  revalidatePath(FEED);

  // SAYING WHAT WAS NOT DONE IS THE USEFUL PART. With no slugs the data cache is
  // dropped but every already-rendered product page keeps its HTML until its own
  // revalidate window passes — so the edit still will not appear promptly, which
  // is the exact complaint this route exists to fix. Revalidating all ~414 paths
  // instead would be worse: it is a full re-render of the catalogue on every
  // call. The caller is told, rather than left to wonder.
  const warning = slugs.length
    ? undefined
    : "No slugs given: the data cache was dropped but no product page was re-rendered. Pass { slugs: [...] } to make an edit appear immediately.";
  if (warning) console.warn(`[revalidate/product-content] ${warning}`);

  console.log(`[revalidate/product-content] tag=${TAG} paths=${slugs.length + 1}`);
  return NextResponse.json({
    ok: true,
    tag: TAG,
    revalidated: [...slugs.map((s) => `/product/${s}`), FEED],
    ...(warning ? { warning } : {}),
  });
}
