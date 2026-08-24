import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  SESSION_HOURS,
  adminPassword,
  adminSecret,
  safeEqual,
  signSession,
} from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-instance throttle. Serverless spreads requests across instances, so this
// slows a guessing run rather than stopping one - the real defence is a long
// ADMIN_PASSWORD. It costs nothing and blunts the obvious script.
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const secret = adminSecret();
  const password = adminPassword();
  if (!secret || !password) {
    return NextResponse.json({ error: "Admin console is not configured." }, { status: 404 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const record = attempts.get(ip);
  if (record && record.count >= MAX_ATTEMPTS && Date.now() < record.until) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let submitted = "";
  try {
    submitted = String(((await request.json()) as { password?: unknown })?.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!safeEqual(submitted, password)) {
    const next = record && Date.now() < record.until ? record.count + 1 : 1;
    attempts.set(ip, { count: next, until: Date.now() + LOCKOUT_MS });
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  attempts.delete(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, await signSession(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
