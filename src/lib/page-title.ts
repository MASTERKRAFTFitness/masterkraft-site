// How long a `<title>` is allowed to get, and what to drop when it gets there.
//
// Every title on the site is rendered through the template in app/layout.tsx,
// which appends " | MASTERKRAFT". Nothing here knows that except this file, so
// the length rules live with the constant rather than being re-derived in each
// route.
//
// TWO LIMITS, ON PURPOSE, and the asymmetry is the point:
//
//   ADD_MAX (60) is the budget for MANUFACTURING a title — appending a category
//   to a short product name in product/[slug]. Inventing length is cheap and
//   there is no reason to spend it all, so a qualifier that would not fit
//   comfortably is not added at all.
//
//   MAX (65) is the budget for KEEPING copy somebody wrote. The fit-out and city
//   pages carry "| Design, Supply & Install", which is the keyword line for the
//   pages that earn this business its leads. Holding those to 60 would strip it
//   from fifteen pages — Melbourne and Brisbane land at 61 — to fix the four
//   that are actually too long. That trade is the wrong way round, and 65 is
//   also where Opinly's own `title_too_long` check fires: it flagged the four at
//   66-69 on 2026-09-16 and left the 61s alone.
//
// Neither limit truncates. A title cut off mid-phrase reads worse than a short
// one, so the rules below drop a whole component or leave the title as it was.

/** What app/layout.tsx's `title.template` appends to every title. */
export const BRAND_SUFFIX = " | MASTERKRAFT";

/** Longest a rendered title may be before a qualifier is dropped. */
export const TITLE_MAX = 65;

/** Longest a rendered title may be for a qualifier to be ADDED in the first place. */
export const TITLE_ADD_MAX = 60;

/**
 * Below this, a title is short enough to be worth padding.
 *
 * "Socks | MASTERKRAFT" is 19 and says nothing; "Olympic Half Rack | MASTERKRAFT"
 * is 31 and already names the product a buyer typed. The audit's own floor is 30,
 * so this sits just above it rather than chasing every title to 60.
 */
export const TITLE_ADD_FLOOR = 40;

/** What this title will actually be once the template has run. */
export function renderedLength(title: string): number {
  return title.length + BRAND_SUFFIX.length;
}

/**
 * `base | qualifier`, or bare `base` when that would run past TITLE_MAX.
 *
 * For copy that already exists and is worth keeping — the "Design, Supply &
 * Install" line on the fit-out and city pages. The qualifier goes whole or not
 * at all.
 */
export function withQualifier(base: string, qualifier: string): string {
  const full = `${base} | ${qualifier}`;
  return renderedLength(full) <= TITLE_MAX ? full : base;
}

/**
 * A title for a name that may be too long to carry the brand.
 *
 * Fourteen product names are long enough that " | MASTERKRAFT" pushes them past
 * what a search result shows — and the brand is at the END, so it is the first
 * thing Google truncates. Emitting it spends visible characters on something
 * nobody will see. Past TITLE_MAX the brand comes off instead, via
 * `title.absolute`, which the template ignores.
 *
 * Two names are still too long with the brand gone (82 and 80 characters). Those
 * are ERP product names and shortening them is a catalogue job, not a title one.
 */
export function withoutBrandIfLong(name: string): string | { absolute: string } {
  return renderedLength(name) > TITLE_MAX ? { absolute: name } : name;
}
