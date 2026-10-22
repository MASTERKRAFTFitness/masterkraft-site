import type { OpinlyMark, OpinlyNode } from "@opinly/shared";

// WHY INTERNAL LINKS ARE REWRITTEN BEFORE RENDERING.
//
// Opinly's editor is Tiptap, and Tiptap's Link extension stamps every link it
// creates with rel="noopener noreferrer nofollow" target="_blank". The renderer
// in @opinly/shared copies that rel verbatim, and falls back to "nofollow" when
// a link has none. So every in-body link to our own pages went out as a
// nofollowed, new-tab link: /distributor and the two distributor posts were
// reachable from the journal only through nofollow links, and the October site
// audit flagged exactly those three as non-indexable with a link-relation
// conflict (they are in the sitemap, yet we told crawlers not to follow them).
//
// <OpinlyContent> takes no mark overrides, only node ones, so the fix is to the
// content rather than the renderer. An internal link keeps an explicit empty
// rel: undefined would hit the renderer's "nofollow" fallback. External links
// are left as the author saved them.

/** True when `href` points at this site: a root-relative path, or an absolute URL on `siteUrl`'s host. */
export function isInternalHref(href: string, siteUrl?: string): boolean {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  if (!siteUrl) return false;
  try {
    const host = (h: string) => h.replace(/^www\./, "");
    return host(new URL(href).hostname) === host(new URL(siteUrl).hostname);
  } catch {
    return false;
  }
}

function followMark(mark: OpinlyMark, siteUrl?: string): OpinlyMark {
  const href = mark.attrs?.href;
  if (mark.type !== "link" || typeof href !== "string" || !isInternalHref(href, siteUrl)) return mark;
  return { ...mark, attrs: { ...mark.attrs, rel: "", target: null } };
}

/** Return `content` with every internal link made followable and same-tab. Does not mutate its input. */
export function followInternalLinks(content: OpinlyNode, siteUrl?: string): OpinlyNode {
  return {
    ...content,
    ...(content.marks && { marks: content.marks.map((m) => followMark(m, siteUrl)) }),
    ...(content.content && { content: content.content.map((c) => followInternalLinks(c, siteUrl)) }),
  };
}
