// Session signing for the internal /admin console.
//
// One shared password (ADMIN_PASSWORD), exchanged for a signed, expiring cookie.
// This is deliberately small: /admin is an internal tool for Michael and Steve,
// not a customer account system, so there are no user records to manage.
//
// Uses Web Crypto rather than node:crypto because `proxy.ts` runs on the edge
// runtime and cannot import node builtins. The same functions are then reusable
// from the Node route handlers, so signing and verifying can never drift apart.

export const ADMIN_COOKIE = "mk_admin";
export const SESSION_HOURS = 12;

const enc = new TextEncoder();

/** Both secrets must be set or the console stays shut. See isConfigured. */
export function adminSecret(): string | null {
  const s = process.env.ADMIN_SESSION_SECRET;
  return s && s.length >= 16 ? s : null;
}

export function adminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  return p && p.length > 0 ? p : null;
}

/**
 * FAILS CLOSED. If either env var is missing the console is unreachable rather
 * than unprotected - an unconfigured deploy must not expose order data and a
 * send-email tool to anyone who guesses the path.
 */
export function isConfigured(): boolean {
  return adminSecret() !== null && adminPassword() !== null;
}

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toB64Url(new Uint8Array(sig));
}

/**
 * Constant-time compare. Length is allowed to leak (it always does, via the
 * cookie), but the contents must not, or the signature is guessable byte by byte.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Token is `<expiry-ms>.<hmac>`, so expiry is signed rather than trusted. */
export async function signSession(secret: string, hours = SESSION_HOURS): Promise<string> {
  const exp = String(Date.now() + hours * 3600 * 1000);
  return `${exp}.${await hmac(exp, secret)}`;
}

export async function verifySession(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp)) return false;
  if (!safeEqual(sig, await hmac(exp, secret))) return false;
  return Number(exp) > Date.now();
}
