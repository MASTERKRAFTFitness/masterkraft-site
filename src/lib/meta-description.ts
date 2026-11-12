// How long a meta description may be, and how to shorten one that is not.
//
// Google shows roughly 155-160 characters of a description and cuts the rest
// mid-word. The authored product copy in product-copy.json and the Journal's
// post descriptions were written as page copy, not search snippets, and 84 of
// them ran from 161 to 478 characters; the 10 Nov Rankability audit flagged
// them. The copy itself is right where it is used on the page, so it is the
// META tag that gets fitted, not the words.
//
// Same rule as lib/page-title: shorten to a whole unit rather than mid-phrase.
// A sentence end if one leaves enough to be useful, else a word boundary with
// an ellipsis, which at least reads as deliberate.

export const DESCRIPTION_MAX = 160;

/** Below this, cutting at a sentence end would leave too little to be worth it. */
const MIN_SENTENCE_CUT = 70;

export function fitDescription(text: string | undefined, max = DESCRIPTION_MAX): string | undefined {
  if (!text) return text;
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;

  const window = t.slice(0, max + 1);
  const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (sentenceEnd + 1 >= MIN_SENTENCE_CUT) return t.slice(0, sentenceEnd + 1);

  const space = t.lastIndexOf(" ", max - 1);
  return `${t.slice(0, space > 0 ? space : max - 1).replace(/[\s,;:–—-]+$/, "")}…`;
}
