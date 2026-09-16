import { revalidatePath, revalidateTag } from "next/cache";
import { opinlyConfig } from "@opinly/next";
import type { OpinlyWebhookEvent } from "@opinly/backend";
import { verifySvixSignature } from "@/lib/opinly-webhook";

export const runtime = "nodejs";

const BLOG_PREFIX = opinlyConfig.blogPrefix || "/blog";
const categoryPrefix = opinlyConfig.categoryPrefix ?? "category";
const authorPrefix = opinlyConfig.authorPrefix ?? "authors";
const tagPrefix = opinlyConfig.tagPrefix ?? "tag";

/**
 * Opinly's publish webhook — what makes a post appear in seconds instead of on
 * the hour.
 *
 * Public and unauthenticated by nature, so the signature check comes before
 * anything else reads the body, and a request that fails it does no work at all.
 */
export async function POST(request: Request) {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  const secret = process.env.OPINLY_WEBHOOK_SIGNING_SECRET;

  if (!secret) {
    console.error("[opinly] webhook: OPINLY_WEBHOOK_SIGNING_SECRET is not set");
    return new Response("Not configured", { status: 500 });
  }
  if (!id || !timestamp || !signature) {
    return new Response("Invalid request", { status: 400 });
  }

  const body = await request.text();
  if (!verifySvixSignature({ secret, id, timestamp, signatureHeader: signature, body })) {
    return new Response("Error verifying webhook", { status: 400 });
  }

  const evt = JSON.parse(body) as OpinlyWebhookEvent;

  // Opinly dual-emits `content.paths-invalidated` (legacy, nested path strings)
  // for the same change. Acting on both would revalidate everything twice.
  if (evt.type !== "content.routes-changed") {
    return new Response("ok", { status: 200 });
  }

  // THE DATA CACHE FIRST. Every fetch in lib/opinly-content carries this tag,
  // and dropping it is what makes the next render actually call Opinly again.
  //
  // `{ expire: 0 }` is the argument, and the choice matters. On Next 16 the
  // second argument is required — the one-argument form is deprecated and only
  // still works if the type error is suppressed. Of the two things that can go
  // there, `{ expire: 0 }` expires the entry immediately, so the next request
  // blocks once and gets the new post. The named profile `'max'` does the
  // opposite: stale-while-revalidate, which keeps serving the OLD post to
  // everyone who arrives before the first visitor's background fetch finishes,
  // and on a long-tail blog page that first visitor may be hours away. A
  // publish webhook exists to make the new version live now, so do not swap
  // this for 'max' because the docs call it "recommended" — that recommendation
  // is written for periodic refreshes, not for publish events.
  revalidateTag("opinly", { expire: 0 });

  // THEN THE RENDERED ROUTES. revalidateTag alone is not enough: it clears the
  // cached API response but leaves the already-rendered HTML in place, so the
  // page keeps serving the old body from the full-route cache. revalidatePath
  // alone is not enough either, for the mirror-image reason. Both, every time.
  for (const route of evt.data.changed) {
    switch (route.type) {
      case "post":
        revalidatePath(`${BLOG_PREFIX}/${route.slug}`);
        break;
      case "category":
        revalidatePath(`${BLOG_PREFIX}/${categoryPrefix}/${route.slug}`);
        break;
      case "author":
        revalidatePath(`${BLOG_PREFIX}/${authorPrefix}/${route.slug}`);
        break;
      case "tag":
        revalidatePath(`${BLOG_PREFIX}/${tagPrefix}/${route.slug}`);
        break;
      case "home":
        revalidatePath(BLOG_PREFIX);
        revalidatePath(`${BLOG_PREFIX}/rss.xml`);
        revalidatePath("/sitemap.xml");
        break;
    }
  }

  return new Response("ok", { status: 200 });
}
