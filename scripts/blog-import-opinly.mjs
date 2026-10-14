// Move the Journal out of Opinly and into Supabase.
//
//   ENV_FILE=../masterkraft-site/.env.local node scripts/blog-import-opinly.mjs <images-dir>           report only
//   ENV_FILE=../masterkraft-site/.env.local node scripts/blog-import-opinly.mjs <images-dir> --write   write
//
// The posts come from scripts/data/opinly-blog-export-2026-10-14.json, which
// was read off the LIVE pages on 14 Oct 2026 — the BlogPosting JSON-LD's
// articleBody converted to Markdown, plus the hero, meta tags and dates. The
// live page rather than Opinly's draft is the source on purpose: four posts had
// drafts queued for re-publish that differ from what was actually on the site,
// and the move must not change a live page.
//
// <images-dir> holds the 17 .webp files fetched from masterkraft.com/blog-images
// on the same day, named by their key. They are uploaded to the blog-images
// bucket under the same key, so /blog-images/<key> keeps resolving.
//
// IDEMPOTENT: upsert on slug and on storage path. It refuses to overwrite a row
// whose source is not 'opinly-import', so it can never clobber a post released
// from the approval queue after the move.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [imagesDir, flag] = process.argv.slice(2);
const WRITE = flag === "--write";
if (!imagesDir) {
  console.error("usage: node scripts/blog-import-opinly.mjs <images-dir> [--write]");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const exp = JSON.parse(
  readFileSync(new URL("./data/opinly-blog-export-2026-10-14.json", import.meta.url), "utf8"),
);

// Body images were exported as root-relative /blog-images/<key> URLs. Kept that
// way: the page serves that path from the bucket, so the Markdown never needs to
// know which Supabase project it lives in.
const keys = new Set();
for (const p of exp.posts) {
  if (p.heroImage) keys.add(p.heroImage.fileKey);
  for (const k of p.bodyImages) keys.add(k);
}
const missing = [...keys].filter((k) => !existsSync(`${imagesDir}/${k}`));
if (missing.length) {
  console.error("missing image files:", missing);
  process.exit(1);
}

const author = {
  slug: exp.author.slug,
  name: exp.author.name,
  bio: exp.author.bio,
  image_key: null,
};

const rows = exp.posts.map((p) => ({
  slug: p.slug,
  title: p.title,
  description: p.description ?? "",
  meta_title: p.metaTitle,
  meta_description: p.metaDescription,
  body_md: p.bodyMd,
  hero_image_key: p.heroImage?.fileKey ?? null,
  hero_image_alt: p.heroImage?.alt ?? null,
  author_slug: p.author?.slug ?? null,
  faqs: p.faqs ?? [],
  published_at: p.firstPublishedAt,
  modified_at: p.modifiedAt,
  source: "opinly-import",
  updated_by: "blog-import-opinly",
}));

const { data: existing, error: readErr } = await db.from("blog_posts").select("slug, source");
if (readErr) throw new Error(`blog_posts: ${readErr.message}`);
const foreign = (existing ?? []).filter(
  (e) => e.source !== "opinly-import" && rows.some((r) => r.slug === e.slug),
);
if (foreign.length) {
  console.error("refusing: these slugs already hold posts not from this import:", foreign);
  process.exit(1);
}

console.log(`${WRITE ? "WRITING" : "DRY RUN"}: 1 author, ${rows.length} posts, ${keys.size} images`);
for (const r of rows) console.log(`  ${r.published_at}  ${r.slug}`);
if (!WRITE) process.exit(0);

for (const key of keys) {
  const { error } = await db.storage
    .from("blog-images")
    .upload(key, readFileSync(`${imagesDir}/${key}`), {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true,
    });
  if (error) throw new Error(`upload ${key}: ${error.message}`);
}
console.log(`uploaded ${keys.size} images`);

const a = await db.from("blog_authors").upsert(author);
if (a.error) throw new Error(`blog_authors: ${a.error.message}`);
const p = await db.from("blog_posts").upsert(rows);
if (p.error) throw new Error(`blog_posts: ${p.error.message}`);
console.log(`upserted ${rows.length} posts`);
