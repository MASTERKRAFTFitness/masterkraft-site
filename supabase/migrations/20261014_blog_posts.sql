-- The Journal (/blog), held here instead of in Opinly.
--
-- WHY. Until October 2026 every post lived in Opinly and the site fetched it
-- from Opinly's API at render time. Part Time CMO is retiring Opinly, so the
-- posts, their images and their authors move into this database and the site
-- reads them the same way it reads product_content: server-side, with the
-- service role key, cached under a tag.
--
-- THE SLUG IS THE URL and must never change for a post that has been live.
-- Every post was imported at exactly the address Opinly served it at, so links,
-- search rankings and social shares carry over. Renaming one is a redirect job
-- in next.config.ts, not an UPDATE here.
--
-- BODY IS MARKDOWN. It is the format Part Time CMO drafts in, the format the
-- client edits in the approval portal, and what lib/markdown.ts renders. HTML
-- in it is shown as text, never parsed.
--
-- IMAGES live in the public `blog-images` Storage bucket and are served at
-- /blog-images/<key>, the same path Opinly's CDN was mounted at, so the image
-- URLs already in posts, in the sitemap and in shared links keep working.

create table if not exists blog_authors (
  slug        text primary key,
  name        text not null,
  bio         text,
  -- Key in the blog-images bucket. Null renders no portrait.
  image_key   text,
  updated_at  timestamptz not null default now()
);

create table if not exists blog_posts (
  slug               text primary key
                     check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title              text not null,
  -- The standfirst under the title, and the card and meta description when
  -- meta_description is empty.
  description        text not null default '',
  meta_title         text,
  meta_description   text,
  body_md            text not null,
  hero_image_key     text,
  hero_image_alt     text,
  author_slug        text references blog_authors (slug),
  -- [{question, answer}] — rendered as a "Frequently asked" block and FAQPage
  -- JSON-LD only when non-empty.
  faqs               jsonb not null default '[]'::jsonb,
  -- NULL means not live. A post is shown only once published_at <= now(), so a
  -- row can be written ahead of its date without appearing early.
  published_at       timestamptz,
  modified_at        timestamptz,
  -- Where the row came from: 'opinly-import' for the October 2026 move,
  -- 'ptcmo' for posts released from the Part Time CMO approval queue.
  source             text not null default 'ptcmo',
  -- The approval-queue row (Part Time CMO's content_items.id) this post was
  -- released from, so a re-release updates the same post instead of forking it.
  source_ref         text unique,
  updated_at         timestamptz not null default now(),
  updated_by         text
);

comment on table blog_posts is
  'The Journal at masterkraft.com/blog. slug is the live URL; body_md is Markdown rendered by lib/markdown.ts.';

-- The index and the sitemap list live posts newest first.
create index if not exists blog_posts_published_idx
  on blog_posts (published_at desc)
  where published_at is not null;

-- --------------------------------------------------------------------- RLS
--
-- Same as product_content: the site reads with the service role key, which
-- bypasses RLS, so RLS on with no policies denies anon and authenticated.
alter table blog_authors enable row level security;
alter table blog_posts enable row level security;

-- ----------------------------------------------------------------- storage
--
-- Public, because every image in it is on a public web page already. Writes
-- still need the service role key.
insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do nothing;
