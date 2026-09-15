// Two jobs, and they do not overlap: the gate for the internal /admin console,
// and the status code on an unwritten equipment subcategory.
//
// Next 16 renamed Middleware to Proxy; this file must stay at src/proxy.ts,
// beside `app`. See node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
//
// The admin half is the optimistic check the Next docs describe: it keeps the
// console off the public web, and every /api/admin route re-checks the session
// itself, so a proxy that is bypassed does not hand out order data.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, adminSecret, verifySession } from "@/lib/admin-auth";
import { getCategory } from "@/lib/categories";
import { getSubcategory } from "@/lib/subcategories";

/**
 * An /equipment/<category>/<sub> that nobody has written a page for goes to the
 * category's `?sub=` filter, with a REAL 308.
 *
 * WHY IT CANNOT BE DONE IN THE PAGE, which is where it was first written. The
 * [category] segment has a loading.tsx, so the response body starts streaming
 * before the page runs, and a `permanentRedirect()` after that point can only
 * be a meta refresh under a 200 — verified against the dev server, which served
 * exactly that. It is the same trap [category]/layout.tsx documents for
 * notFound(), and the loading docs name this file as the fix: "run this check
 * in proxy ... Keep proxy checks fast." Two Map lookups over committed arrays
 * is as fast as it gets, and neither awaits anything.
 *
 * AN UNKNOWN CATEGORY IS LEFT ALONE. The category layout 404s it properly,
 * outside the stream, and redirecting first would turn one clean 404 into a hop
 * through a page that 404s anyway.
 */
function equipmentSubcategory(request: NextRequest) {
  const [, , category, sub] = request.nextUrl.pathname.split("/");
  if (!category || !sub) return NextResponse.next();
  if (!getCategory(category)) return NextResponse.next();
  if (getSubcategory(category, sub)) return NextResponse.next();

  const url = new URL(`/equipment/${category}`, request.url);
  url.searchParams.set("sub", sub);
  return NextResponse.redirect(url, 308);
}

// Reachable without a session: the login page, and the route that issues one.
const PUBLIC_PATHS = new Set(["/admin/login", "/api/admin/login"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // THE PUBLIC PATH IS ANSWERED AND RETURNED BEFORE ANY OF THE ADMIN GATE RUNS.
  // Nothing below this line may see an /equipment URL: the gate 404s an
  // unconfigured deploy and redirects an unauthenticated one, and either of
  // those reaching the shop would take the catalogue down.
  if (pathname.startsWith("/equipment/")) return equipmentSubcategory(request);

  const secret = adminSecret();

  // Unconfigured deploy: the console does not exist, including its login page.
  // Fails closed rather than open - see isConfigured in lib/admin-auth.
  if (!secret) return new NextResponse("Not found", { status: 404 });

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  if (await verifySession(request.cookies.get(ADMIN_COOKIE)?.value, secret)) {
    return NextResponse.next();
  }

  // An expired session on an API call must not answer with a login page: the
  // console's fetch would render HTML into the chat. Answer in kind instead.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const login = new URL("/admin/login", request.url);
  if (pathname !== "/admin") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Exactly two segments under /equipment — a category page is not this file's
  // business, and neither is anything deeper.
  matcher: ["/admin/:path*", "/api/admin/:path*", "/equipment/:category/:sub"],
};
