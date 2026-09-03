// Every URL that matches no route at all — and the only place the site can see
// one before it becomes a 404.
//
// WHY A CATCH-ALL AND NOT `not-found.tsx`. The 404 UI still lives in
// not-found.tsx and this page renders none of its own: it exists to learn the
// path and then hand over. A root not-found that reads the pathname from
// `headers()` cannot be prerendered, and since any route can fall back to it,
// that makes EVERY route dynamic — 35 static routes to none, measured on this
// build. A catch-all pays the same cost on its own, where it is owed: only URLs
// that match nothing are rendered on demand.
//
// ROUTING PRECEDENCE MAKES THIS SAFE. A catch-all is the lowest-priority match
// in App Router, so every real route — static segment or dynamic — is chosen
// ahead of it. Nothing that resolves today starts resolving here.
//
// The 362 WordPress-era URLs in legacy-redirects.json are redirected in
// next.config before routing runs, so they never reach this page and never count
// as 404s. What lands here is the part of the problem nobody has accounted for.
import { notFound } from "next/navigation";
import { after } from "next/server";
import { recordNotFound } from "@/lib/not-found-log";

export default async function MissingPage({
  params,
}: {
  params: Promise<{ missing: string[] }>;
}) {
  const { missing } = await params;
  // Segments arrive URL-decoded; re-encoding keeps the recorded path identical
  // to the one that was requested, so it can be pasted into a redirect map.
  const path = "/" + missing.map(encodeURIComponent).join("/");
  after(() => recordNotFound(path));
  notFound();
}
