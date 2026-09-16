import type { ClassNames } from "@opinly/react";

/**
 * Tailwind classes for Opinly's rendered post body.
 *
 * Written out per node type rather than leaning on a typography plugin, because
 * this project's Tailwind build does not include one and because the site's
 * headings are already restyled globally (uppercase Oswald, in globals.css) —
 * inside an article that treatment belongs on h2 and below only, at a weight
 * that reads as prose rather than as another page banner.
 */
export const postProse: ClassNames = {
  paragraph: "text-ink leading-relaxed mb-5",
  heading: "mt-10 mb-4 text-xl md:text-2xl font-bold scroll-mt-24",
  image: "w-full h-auto my-8",
  bulletList: "list-disc pl-6 mb-5 space-y-2 text-ink",
  orderedList: "list-decimal pl-6 mb-5 space-y-2 text-ink",
  listItem: "leading-relaxed",
  blockquote: "border-l-2 border-accent pl-5 my-8 text-lg text-ash italic",
  code: "font-mono text-sm bg-smoke px-1.5 py-0.5",
  codeBlock: "font-mono text-sm bg-carbon text-white p-5 my-6 overflow-x-auto",
  horizontalRule: "border-0 border-t border-line my-10",
  table: "w-full my-8 text-sm border-collapse [&_td]:border [&_th]:border [&_td]:border-line [&_th]:border-line [&_td]:p-2.5 [&_th]:p-2.5 [&_th]:bg-smoke [&_th]:text-left",
  link: "text-accent-600 underline underline-offset-2 hover:text-ink",
};
