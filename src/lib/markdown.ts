// Markdown to HTML for Journal posts.
//
// ESCAPE FIRST. The whole source is HTML-escaped before any rule runs, so the
// only tags in the output are the ones this file writes. That matters because
// post bodies are not only engineer-written: a client approver can rewrite the
// copy in Part Time CMO's approval portal, and that text is rendered here, on a
// public page. Raw HTML in a post is shown as text, and a link or image with a
// scheme other than http(s), mailto, a root-relative path or an anchor renders
// as plain text.
//
// It covers what the Journal's posts use — checked against all 13 posts
// imported from Opinly: headings, paragraphs, bold, italic, inline and fenced
// code, links, images with titles, bullet and numbered lists, blockquotes,
// rules, GFM tables and backslash escapes. It is deliberately not CommonMark:
// no nested lists, no reference links, no HTML blocks.
//
// HEADING IDS match the ones Opinly generated, so in-page anchors that were
// shared or linked while the Journal was on Opinly still land.

export type MarkdownClasses = Partial<
  Record<
    | "p"
    | "h2"
    | "h3"
    | "h4"
    | "ul"
    | "ol"
    | "li"
    | "blockquote"
    | "code"
    | "pre"
    | "hr"
    | "img"
    | "table"
    | "a",
    string
  >
>;

const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** The anchor id for a heading: Opinly's rule, kept so old #fragments still work. */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    // An apostrophe is a separator like any other: "Singapore's" -> singapore-s.
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const cls = (c: string | undefined) => (c ? ` class="${c}"` : "");

// Private-use code points as placeholders: they cannot occur in the escaped
// source, so a placeholder can never be confused with real text.
const ESC = "";
const CODE = "";
const END = "";

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url) && !/^https?:\/\/(www\.)?masterkraft\.com(\/|$)/i.test(url);
}

/**
 * Inline rules over ALREADY-ESCAPED text. `escapes` and `codes` are lifted out
 * first so their contents are never re-read as emphasis or links.
 */
function inline(text: string, c: MarkdownClasses): string {
  const escapes: string[] = [];
  const codes: string[] = [];
  let t = text.replace(/\\([\\`*_{}[\]()#+\-.!|~]|&gt;|&lt;|&quot;|&#39;|&amp;)/g, (_, ch: string) => {
    escapes.push(ch);
    return `${ESC}${escapes.length - 1}${END}`;
  });
  t = t.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(code);
    return `${CODE}${codes.length - 1}${END}`;
  });

  // Images before links: the syntax differs only by the leading '!'. The
  // optional title arrives escaped, hence &quot;.
  t = t.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g,
    (_, alt: string, url: string, title?: string) =>
      SAFE_URL.test(unescapeHtml(url))
        ? `<img src="${url}" alt="${alt}"${title ? ` title="${title}"` : ""} loading="lazy"${cls(c.img)}>`
        : alt,
  );
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g, (_, label: string, url: string) => {
    const raw = unescapeHtml(url);
    if (!SAFE_URL.test(raw)) return label;
    const ext = isExternal(raw) ? ` target="_blank" rel="noopener noreferrer"` : "";
    return `<a href="${url}"${ext}${cls(c.a)}>${label}</a>`;
  });

  t = t.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/__(?=\S)([\s\S]*?\S)__/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, "$1<em>$2</em>");
  t = t.replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, "$1<em>$2</em>");

  t = t.replace(new RegExp(`${CODE}(\\d+)${END}`, "g"), (_, i: string) => `<code${cls(c.code)}>${codes[Number(i)]}</code>`);
  t = t.replace(new RegExp(`${ESC}(\\d+)${END}`, "g"), (_, i: string) => escapes[Number(i)]);
  return t;
}

/** Plain text of an escaped inline fragment, for heading ids. */
function plain(text: string): string {
  return unescapeHtml(
    inline(text, {})
      .replace(/<[^>]+>/g, ""),
  );
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  // Split on pipes that are not backslash-escaped.
  return s.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export function renderMarkdown(src: string, c: MarkdownClasses = {}): string {
  if (!src || !src.trim()) return "";
  const lines = escapeHtml(src.replace(/\r\n?/g, "\n")).split("\n");
  const out: string[] = [];
  const ids = new Map<string, number>();
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p${cls(c.p)}>${inline(para.join(" "), c)}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) {
      out.push(
        `<${list.tag}${cls(c[list.tag])}>${list.items.map((i) => `<li${cls(c.li)}>${inline(i, c)}</li>`).join("")}</${list.tag}>`,
      );
    }
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote${cls(c.blockquote)}>${inline(quote.join(" "), c)}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code: everything to the closing fence, verbatim (already escaped).
    if (/^\s*```/.test(line)) {
      flushAll();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      out.push(`<pre${cls(c.pre)}><code>${body.join("\n")}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      // A blank line between two items of the same list is a "loose" list, not
      // the end of it. Splitting there would turn one numbered list into a run
      // of lists that each restart at 1.
      if (list && !para.length && !quote.length) {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        const next = lines[j] ?? "";
        const same = list.tag === "ul" ? /^\s*[-*+]\s+/ : /^\s*\d+[.)]\s+/;
        if (same.test(next)) continue;
      }
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      flushAll();
      // An h1 in a body would compete with the page title; the page owns h1.
      const level = Math.min(Math.max(heading[1].length, 2), 4) as 2 | 3 | 4;
      const base = headingId(plain(heading[2])) || "section";
      const n = ids.get(base) ?? 0;
      ids.set(base, n + 1);
      const id = n ? `${base}-${n}` : base;
      out.push(`<h${level} id="${id}"${cls(c[`h${level}`])}>${inline(heading[2], c)}</h${level}>`);
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushAll();
      out.push(`<hr${cls(c.hr)}>`);
      continue;
    }

    // A GFM table: a pipe row immediately followed by a rule row.
    if (line.includes("|") && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      flushAll();
      const head = splitRow(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].includes("|") && lines[i].trim(); i++) rows.push(splitRow(lines[i]));
      i--;
      const th = head.map((h) => `<th>${inline(h, c)}</th>`).join("");
      const tb = rows
        .map((r) => `<tr>${head.map((_, j) => `<td>${inline(r[j] ?? "", c)}</td>`).join("")}</tr>`)
        .join("");
      out.push(`<table${cls(c.table)}><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`);
      continue;
    }

    const quoted = line.match(/^\s*&gt;\s?(.*)$/); // '>' is already escaped
    if (quoted) {
      flushPara();
      flushList();
      quote.push(quoted[1]);
      continue;
    }
    flushQuote();

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const tag = bullet ? "ul" : "ol";
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    // A wrapped line continues the current list item rather than ending the list.
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushAll();
  return out.join("\n");
}
