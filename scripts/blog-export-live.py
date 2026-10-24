#!/usr/bin/env python3
# Read live Journal posts off masterkraft.com and add them to
# scripts/data/opinly-blog-export.json, in the shape blog-import-opinly.mjs reads.
#
#   python3 scripts/blog-export-live.py <slug> [<slug> ...]
#
# Same rule as the 15 Oct export: the LIVE page is the source, not Opinly's
# working draft, so the move never changes what a reader already sees. The
# article HTML is converted back to the Markdown subset lib/markdown.ts renders
# (headings, paragraphs, bold/italic, links, images, lists, blockquotes, tables).
# A slug already in the export is replaced; its firstPublishedAt is kept.
import html
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

EXPORT = Path(__file__).parent / "data" / "opinly-blog-export.json"
SITE = "https://masterkraft.com"
IMG_RE = re.compile(r"/blog-images/([A-Za-z0-9._-]+\.(?:webp|png|jpe?g))")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "masterkraft-blog-export"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


class ArticleToMd(HTMLParser):
    """Walks the <article> body. The first <p> is the date/author byline and is skipped."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []        # finished blocks
        self.buf = []        # inline text of the current block
        self.block = None    # p, h2, h3, h4, li, blockquote, td, th
        self.list_stack = []
        self.ol_n = []
        self.links = []
        self.table = None    # list of rows; row = list of cells
        self.row = None
        self.skip_first_p = True
        self.skipping = False
        self.images = []
        self.faq_depth = 0

    def flush(self, prefix=""):
        text = re.sub(r"[ \t\n]+", " ", "".join(self.buf)).strip()
        self.buf = []
        if text:
            self.out.append(prefix + text)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.skipping:
            return
        if tag in ("section", "dl") and self.faq_depth == 0 and "border-t" in (a.get("class") or ""):
            # The "Frequently asked" block: rendered from faqs, not body_md.
            self.faq_depth = 1
            return
        if self.faq_depth:
            if tag in ("section", "dl", "div"):
                self.faq_depth += 1
            return
        if tag == "p":
            if self.skip_first_p:
                self.skip_first_p = False
                self.skipping = True
                return
            if self.block == "li":
                return  # <li><p>…</p></li>: the item is the block
            self.block = "p"
        elif tag in ("h2", "h3", "h4"):
            self.block = tag
        elif tag in ("ul", "ol"):
            self.list_stack.append(tag)
            self.ol_n.append(0)
        elif tag == "li":
            self.block = "li"
            if self.list_stack and self.list_stack[-1] == "ol":
                self.ol_n[-1] += 1
        elif tag == "blockquote":
            self.block = "blockquote"
        elif tag in ("strong", "b"):
            self.buf.append("**")
        elif tag in ("em", "i"):
            self.buf.append("*")
        elif tag == "code":
            self.buf.append("`")
        elif tag == "a":
            self.links.append(a.get("href") or "")
            self.buf.append("[")
        elif tag == "br":
            self.buf.append(" ")
        elif tag == "img":
            src = a.get("src") or ""
            m = IMG_RE.search(src)
            if m:
                key = m.group(1)
                self.images.append(key)
                alt = (a.get("alt") or "").replace("]", "")
                title = (a.get("title") or "").replace('"', "")
                title = f' "{title}"' if title else ""
                self.out.append(f"![{alt}](/blog-images/{key}{title})")
        elif tag == "table":
            self.table = []
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.block = tag
        elif tag == "hr":
            self.out.append("---")

    def handle_endtag(self, tag):
        if self.skipping:
            if tag == "p":
                self.skipping = False
            return
        if self.faq_depth:
            if tag in ("section", "dl", "div"):
                self.faq_depth -= 1
            return
        if tag == "p" and self.block == "p":
            self.flush()
            self.block = None
        elif tag in ("h2", "h3", "h4") and self.block == tag:
            self.flush("#" * int(tag[1]) + " ")
            self.block = None
        elif tag == "li":
            kind = self.list_stack[-1] if self.list_stack else "ul"
            self.flush(f"{self.ol_n[-1]}. " if kind == "ol" else "- ")
            self.block = None
        elif tag in ("ul", "ol"):
            self.list_stack.pop()
            self.ol_n.pop()
        elif tag == "blockquote":
            self.flush("> ")
            self.block = None
        elif tag in ("strong", "b"):
            self.buf.append("**")
        elif tag in ("em", "i"):
            self.buf.append("*")
        elif tag == "code":
            self.buf.append("`")
        elif tag == "a":
            href = self.links.pop() if self.links else ""
            if href.startswith(SITE):
                href = href[len(SITE):] or "/"
            self.buf.append(f"]({href})")
        elif tag in ("td", "th"):
            self.row.append(re.sub(r"\s+", " ", "".join(self.buf)).strip().replace("|", "\\|"))
            self.buf = []
            self.block = None
        elif tag == "tr":
            self.table.append(self.row)
            self.row = None
        elif tag == "table":
            rows = self.table
            self.table = None
            if rows:
                lines = ["| " + " | ".join(rows[0]) + " |", "| " + " | ".join("---" for _ in rows[0]) + " |"]
                lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
                self.out.append("\n".join(lines))

    def handle_data(self, data):
        if self.skipping or self.faq_depth:
            return
        if self.block or self.table is not None:
            self.buf.append(data)


def tidy(md):
    # Empty emphasis left by adjacent tags.
    return md.replace("****", "")


def ld_blocks(page):
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', page, re.S):
        try:
            yield json.loads(m.group(1))
        except json.JSONDecodeError:
            pass


def meta(page, name, attr="name"):
    m = re.search(rf'<meta {attr}="{re.escape(name)}" content="([^"]*)"', page)
    return html.unescape(m.group(1)) if m else None


def export_post(slug, existing):
    page = fetch(f"{SITE}/blog/{slug}")
    posting = next((b for b in ld_blocks(page) if b.get("@type") == "BlogPosting"), None)
    if not posting:
        raise SystemExit(f"{slug}: no BlogPosting JSON-LD on the live page")
    faq_ld = next((b for b in ld_blocks(page) if b.get("@type") == "FAQPage"), None)

    art = page[page.find("<article"): page.find("</article>")]
    p = ArticleToMd()
    p.feed(art)
    body = tidy("\n\n".join(p.out))

    image = posting.get("image")
    image_url = image.get("url") if isinstance(image, dict) else (image[0] if isinstance(image, list) else image)
    hero = None
    if image_url:
        m = IMG_RE.search(image_url)
        if m:
            # The page carries no alt for the hero; keep the one already exported,
            # else the headline.
            prior_hero = existing.get(slug, {}).get("heroImage") or {}
            alt = prior_hero.get("alt") if prior_hero.get("fileKey") == m.group(1) else None
            hero = {"fileKey": m.group(1), "alt": alt or posting.get("headline")}

    title_tag = re.search(r"<title>(.*?)</title>", page, re.S)
    meta_title = html.unescape(title_tag.group(1)).strip() if title_tag else None
    if meta_title:
        meta_title = re.sub(r"\s*\|\s*masterkraft$", "", meta_title, flags=re.I)
    if meta_title == posting.get("headline"):
        meta_title = None

    author = posting.get("author") or {}
    if isinstance(author, list):
        author = author[0]
    faqs = []
    for q in (faq_ld or {}).get("mainEntity", []):
        faqs.append({"question": q.get("name"), "answer": (q.get("acceptedAnswer") or {}).get("text")})

    prior = existing.get(slug, {})
    return {
        "slug": slug,
        "title": posting.get("headline"),
        "description": posting.get("description") or meta(page, "description") or "",
        "metaTitle": meta_title,
        "metaDescription": None,
        "heroImage": hero,
        "firstPublishedAt": prior.get("firstPublishedAt") or posting.get("datePublished"),
        "jsonLdDatePublished": posting.get("datePublished"),
        "modifiedAt": posting.get("dateModified"),
        "author": {"slug": "steve_callanan", "name": author.get("name") or "Steve Callanan"},
        "category": None,
        "tags": [],
        "faqs": faqs,
        "bodyImages": [k for k in p.images if not hero or k != hero["fileKey"]],
        "words": len(re.findall(r"\w+", body)),
        "bodyMd": body,
    }


def main():
    slugs = sys.argv[1:]
    if not slugs:
        raise SystemExit("usage: blog-export-live.py <slug> [<slug> ...]")
    data = json.loads(EXPORT.read_text())
    existing = {p["slug"]: p for p in data["posts"]}
    for slug in slugs:
        post = export_post(slug, existing)
        existing[slug] = post
        print(f"{slug}: {post['words']} words, hero={bool(post['heroImage'])}, "
              f"{len(post['bodyImages'])} body images, {len(post['faqs'])} faqs")
    data["posts"] = sorted(existing.values(), key=lambda p: p["firstPublishedAt"] or "")
    EXPORT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
