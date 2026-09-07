// Decides whether this category exists BEFORE anything is streamed.
//
// THE BUG THIS FIXES. `loading.tsx` in this segment wraps the page in Suspense.
// The moment that fallback renders, the response headers are gone and the status
// is fixed at 200 — so `notFound()` inside page.tsx produced a SOFT 404: the 404
// body under a 200 status. It is the same trap the product page documents and
// avoids by having no loading.tsx at all. Next marks those responses
// `<meta name="robots" content="noindex">`, so Google was not indexing them, but
// a dead URL answering 200 is still wrong for link checkers, for Search
// Console's soft-404 report, and for anything counting real 404s.
//
// WHY HERE AND NOT IN THE PAGE. A layout renders OUTSIDE its segment's Suspense
// boundary — the hierarchy is layout, then loading, then page — so this runs
// while the status can still be set. The check has to be cheap and must not
// suspend, or it starts the stream itself and we are back where we began:
// getCategory is a lookup over twelve entries in a committed array, no await.
//
// WHY NOT DELETE loading.tsx. The skeleton is doing real work — a category page
// waits on Unleashed — and losing it to fix a status code would be a bad trade.
// This keeps both.
//
// See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md,
// "Status Codes": ensure the resource exists before the response body is
// streamed.
import { notFound } from "next/navigation";
import { after } from "next/server";
import { getCategory } from "@/lib/categories";
import { recordNotFound } from "@/lib/not-found-log";

export default async function CategoryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!getCategory(category)) {
    after(() => recordNotFound(`/equipment/${encodeURIComponent(category)}`));
    notFound();
  }
  return children;
}
