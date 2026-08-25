// Gate for the internal /admin console.
//
// Next 16 renamed Middleware to Proxy; this file must stay at src/proxy.ts,
// beside `app`. See node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
//
// This is the optimistic check the Next docs describe: it keeps the console off
// the public web, and every /api/admin route re-checks the session itself, so a
// proxy that is bypassed does not hand out order data.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, adminSecret, verifySession } from "@/lib/admin-auth";

// Reachable without a session: the login page, and the route that issues one.
const PUBLIC_PATHS = new Set(["/admin/login", "/api/admin/login"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
