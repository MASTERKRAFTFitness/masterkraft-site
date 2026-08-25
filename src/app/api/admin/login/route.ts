import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  SESSION_HOURS,
  adminPassword,
  adminSecret,
  safeEqual,
  signSession,
} from "@/lib/admin-auth";
import { identityMode } from "@/lib/admin-db";
import { requestLoginCode, verifyLoginCode } from "@/lib/admin-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-instance throttle. Serverless spreads requests across instances, so this
// slows a guessing run rather than stopping one. The real defence is that codes
// are six digits, single use, expire in ten minutes and burn after five wrong
// guesses (see verifyLoginCode).
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 10;
const LOCKOUT_MS = 10 * 60 * 1000;

function sessionCookie(value: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: value ? SESSION_HOURS * 3600 : 0,
  };
}

export async function POST(request: Request) {
  const secret = adminSecret();
  if (!secret) {
    return NextResponse.json({ error: "Admin console is not configured." }, { status: 404 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const record = attempts.get(ip);
  if (record && record.count >= MAX_ATTEMPTS && Date.now() < record.until) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const strike = () => {
    const next = record && Date.now() < record.until ? record.count + 1 : 1;
    attempts.set(ip, { count: next, until: Date.now() + LOCKOUT_MS });
  };

  let body: { email?: unknown; code?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // ---- shared-password mode: no database, so no identity and no audit ----
  if (identityMode() === "shared") {
    const password = adminPassword();
    if (!password) {
      return NextResponse.json({ error: "Admin console is not configured." }, { status: 404 });
    }
    if (!safeEqual(String(body.password ?? ""), password)) {
      strike();
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }
    attempts.delete(ip);
    const response = NextResponse.json({ ok: true, mode: "shared" });
    response.cookies.set(ADMIN_COOKIE, await signSession(secret), sessionCookie("x"));
    return response;
  }

  // ---- identity mode: email, then a code sent to it ----
  const email = String(body.email ?? "").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Step one: no code supplied yet, so issue one.
  if (body.code === undefined || String(body.code).trim() === "") {
    await requestLoginCode(email);
    // Always the same answer, so this cannot be used to discover who works here.
    return NextResponse.json({ ok: true, stage: "code_sent" });
  }

  const result = await verifyLoginCode(email, String(body.code));
  if (!result.ok) {
    strike();
    const message = {
      invalid: "That code is not right.",
      expired: "That code has expired. Ask for a new one.",
      too_many: "Too many wrong attempts. Ask for a new code.",
      unavailable: "Sign in is temporarily unavailable.",
    }[result.reason];
    return NextResponse.json({ error: message }, { status: result.reason === "unavailable" ? 503 : 401 });
  }

  attempts.delete(ip);
  const response = NextResponse.json({
    ok: true,
    stage: "signed_in",
    user: { email: result.user.email, name: result.user.name },
  });
  response.cookies.set(
    ADMIN_COOKIE,
    await signSession(secret, {
      sub: result.user.id,
      email: result.user.email,
      name: result.user.name,
    }),
    sessionCookie("x")
  );
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", sessionCookie(""));
  return response;
}
