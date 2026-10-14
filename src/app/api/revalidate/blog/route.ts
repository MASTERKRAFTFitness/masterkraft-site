// Make a published or edited Journal post show up now, instead of within the hour.
//
// lib/blog.ts caches the whole Journal for 3600s under the `blog` tag. This
// route drops that tag and re-renders every page that reads it. Called by the
// publish path after it writes blog_posts, and by hand after an edit in the
// Supabase table editor.
//
// TAG AND PATHS, BOTH — the same lesson as api/revalidate/product-content:
// revalidateTag clears the cached data but leaves rendered HTML in the
// full-route cache, and revalidatePath does the mirror-image half.
//
// EVERY BLOG PAGE, not just the post's. A new post changes the index, its
// author's archive, the feed, the sitemap and the /resources preview as well as
// its own page, and the Journal is small enough that re-rendering all of it is
// cheaper than working out which pages a given change touched.
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { BLOG_TAG } from "@/lib/blog";

export const dynamic = "force-dynamic";

const PATHS = ["/blog/rss.xml", "/sitemap.xml", "/resources"] as const;

/**
 * FAIL CLOSED, the same secret and reasoning as api/revalidate/product-content:
 * an open cache-flush route is a cheap way to make the site slow.
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

export async function POST(req: Request) {
  const auth = authorised(req);
  if (!auth.ok) {
    console.warn(`[revalidate/blog] refused: ${auth.why}`);
    return NextResponse.json({ ok: false, error: auth.why }, { status: auth.status });
  }

  revalidateTag(BLOG_TAG, { expire: 0 });
  revalidatePath("/blog/[[...slug]]", "page");
  for (const p of PATHS) revalidatePath(p);

  console.log("[revalidate/blog] tag and all blog paths dropped");
  return NextResponse.json({ ok: true, tags: [BLOG_TAG], revalidated: ["/blog/[[...slug]]", ...PATHS] });
}
