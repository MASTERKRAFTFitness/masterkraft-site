import type { MarkdownClasses } from "@/lib/markdown";

/**
 * Tailwind classes for a rendered post body.
 *
 * Written out per element rather than leaning on a typography plugin, because
 * this project's Tailwind build does not include one and because the site's
 * headings are already restyled globally (uppercase Oswald, in globals.css) —
 * inside an article that treatment belongs on h2 and below only, at a weight
 * that reads as prose rather than as another page banner.
 *
 * These are the classes the Journal used while Opinly rendered it, carried over
 * so the move changes where posts come from and nothing about how they look.
 */
export const postProse: MarkdownClasses = {
  p: "text-ink leading-relaxed mb-5",
  h2: "mt-10 mb-4 text-xl md:text-2xl font-bold scroll-mt-24",
  h3: "mt-10 mb-4 text-xl md:text-2xl font-bold scroll-mt-24",
  h4: "mt-8 mb-3 text-lg font-bold scroll-mt-24",
  img: "w-full h-auto my-8",
  ul: "list-disc pl-6 mb-5 space-y-2 text-ink",
  ol: "list-decimal pl-6 mb-5 space-y-2 text-ink",
  li: "leading-relaxed",
  blockquote: "border-l-2 border-accent pl-5 my-8 text-lg text-ash italic",
  code: "font-mono text-sm bg-smoke px-1.5 py-0.5",
  pre: "font-mono text-sm bg-carbon text-white p-5 my-6 overflow-x-auto",
  hr: "border-0 border-t border-line my-10",
  table:
    "w-full my-8 text-sm border-collapse [&_td]:border [&_th]:border [&_td]:border-line [&_th]:border-line [&_td]:p-2.5 [&_th]:p-2.5 [&_th]:bg-smoke [&_th]:text-left",
  a: "text-accent-600 underline underline-offset-2 hover:text-ink",
};
