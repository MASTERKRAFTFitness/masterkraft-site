// Publish a Journal post sent from Part Time CMO's approval queue.
//
// THE ONLY WRITE PATH INTO blog_posts besides the one-off Opinly import. Part
// Time CMO's admin app holds the approval: a post reaches this route only after
// the client (Steve) has approved it there, and the admin app's daily job sends
// it here ahead of its slot. That app has no key to this database and does not
// need one: this route is the seam, the same arrangement the product-content
// webhook uses in the other direction.
//
// IDEMPOTENT ON sourceRef — the approval-queue row id. Sending the same row
// twice updates the same post instead of creating a second one, so a retry
// after a timeout is always safe. A post's SLUG IS FIXED once it exists: a
// re-send with a different slug keeps the original URL, because a URL that has
// been live must not move.
//
// The post is written with its publish time, not made live now: lib/blog only
// shows rows whose published_at has passed, so a post sent at 7am for a noon
// slot appears at noon (within the Journal's cache window).
//
// Body: {
//   sourceRef, title, bodyMd, publishedAt,               required
//   slug, description, metaTitle, metaDescription,        optional
//   authorSlug,                                           optional, must exist
//   heroImage: { base64, contentType, alt }               optional
// }
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { adminDb } from "@/lib/admin-db";
import { BLOG_TAG, postUrl, slugify } from "@/lib/blog";

export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const IMAGE_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Fail closed: an open write route into the Journal is defacement on demand. */
function authorised(req: Request): { ok: true } | { ok: false; status: number; why: string } {
  const secret = process.env.BLOG_PUBLISH_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: 503,
      why: "BLOG_PUBLISH_SECRET is not set on this deployment, so this route refuses to run.",
    };
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, why: "Unauthorised." };
  }
  return { ok: true };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function POST(req: Request) {
  const auth = authorised(req);
  if (!auth.ok) {
    console.warn(`[blog/publish] refused: ${auth.why}`);
    return NextResponse.json({ ok: false, error: auth.why }, { status: auth.status });
  }
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Body is not valid JSON" }, { status: 400 });
  }

  const sourceRef = str(body.sourceRef);
  const title = str(body.title);
  const bodyMd = typeof body.bodyMd === "string" ? body.bodyMd : "";
  const publishedAt = str(body.publishedAt);
  const missing = [
    !sourceRef && "sourceRef",
    !title && "title",
    !bodyMd.trim() && "bodyMd",
    (!publishedAt || Number.isNaN(Date.parse(publishedAt))) && "publishedAt",
  ].filter(Boolean);
  if (missing.length) {
    return NextResponse.json({ ok: false, error: `Missing or invalid: ${missing.join(", ")}` }, { status: 400 });
  }

  const existing = await db
    .from("blog_posts")
    .select("slug, hero_image_key, hero_image_alt")
    .eq("source_ref", sourceRef)
    .maybeSingle();
  if (existing.error) {
    return NextResponse.json({ ok: false, error: existing.error.message }, { status: 502 });
  }

  // The slug of an existing post never changes; a new one takes the slug it was
  // sent with, or one made from the title.
  const slug = existing.data?.slug ?? (str(body.slug) || slugify(title));
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ ok: false, error: `Slug ${JSON.stringify(slug)} is not URL-safe` }, { status: 400 });
  }
  if (!existing.data) {
    const taken = await db.from("blog_posts").select("slug").eq("slug", slug).maybeSingle();
    if (taken.data) {
      return NextResponse.json(
        { ok: false, error: `A different post already lives at /blog/${slug}. Send a different slug.` },
        { status: 409 },
      );
    }
  }

  const authorSlug = str(body.authorSlug) || null;
  if (authorSlug) {
    const a = await db.from("blog_authors").select("slug").eq("slug", authorSlug).maybeSingle();
    if (!a.data) {
      return NextResponse.json({ ok: false, error: `Unknown author ${JSON.stringify(authorSlug)}` }, { status: 400 });
    }
  }

  // The hero, stored under a content hash so a re-send of the same picture is a
  // no-op and a changed picture never serves a stale cached copy.
  let heroKey = existing.data?.hero_image_key ?? null;
  let heroAlt = existing.data?.hero_image_alt ?? null;
  const hero = body.heroImage as { base64?: unknown; contentType?: unknown; alt?: unknown } | undefined;
  if (hero && typeof hero.base64 === "string" && hero.base64) {
    const ext = IMAGE_TYPES[str(hero.contentType)];
    if (!ext) {
      return NextResponse.json({ ok: false, error: "heroImage.contentType must be webp, jpeg or png" }, { status: 400 });
    }
    const bytes = Buffer.from(hero.base64, "base64");
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ ok: false, error: "heroImage must be between 1 byte and 8MB" }, { status: 400 });
    }
    heroKey = `${slug}-${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}.${ext}`;
    const up = await db.storage.from("blog-images").upload(heroKey, bytes, {
      contentType: str(hero.contentType),
      cacheControl: "31536000",
      upsert: true,
    });
    if (up.error) return NextResponse.json({ ok: false, error: `image upload: ${up.error.message}` }, { status: 502 });
    heroAlt = str(hero.alt) || title;
  }

  const row = {
    slug,
    title,
    description: str(body.description),
    meta_title: str(body.metaTitle) || null,
    meta_description: str(body.metaDescription) || null,
    body_md: bodyMd,
    hero_image_key: heroKey,
    hero_image_alt: heroAlt,
    author_slug: authorSlug,
    published_at: new Date(publishedAt).toISOString(),
    modified_at: existing.data ? new Date().toISOString() : null,
    source: "ptcmo",
    source_ref: sourceRef,
    updated_at: new Date().toISOString(),
    updated_by: "ptcmo-publish",
  };
  const write = existing.data
    ? await db.from("blog_posts").update(row).eq("source_ref", sourceRef)
    : await db.from("blog_posts").insert(row);
  if (write.error) return NextResponse.json({ ok: false, error: write.error.message }, { status: 502 });

  // Same flush as /api/revalidate/blog. A post dated in the future is hidden by
  // lib/blog until its time, so flushing now changes nothing a visitor sees.
  revalidateTag(BLOG_TAG, { expire: 0 });
  revalidatePath("/blog/[[...slug]]", "page");
  for (const p of ["/blog/rss.xml", "/sitemap.xml", "/resources"]) revalidatePath(p);

  console.log(`[blog/publish] ${existing.data ? "updated" : "created"} /blog/${slug} for ${row.published_at}`);
  return NextResponse.json({
    ok: true,
    created: !existing.data,
    slug,
    url: postUrl(slug),
    publishedAt: row.published_at,
  });
}
