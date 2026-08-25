// Session signing for the internal /admin console.
//
// The cookie carries the signed identity of the person using the console, so
// every recorded action has a name against it. Before the database existed this
// held nothing but an expiry, and "who approved that" had no answer.
//
// Uses Web Crypto rather than node:crypto because `proxy.ts` runs on the edge
// runtime and cannot import node builtins. The same functions are reused from
// the Node route handlers, so signing and verifying can never drift apart.

export const ADMIN_COOKIE = "mk_admin";
export const SESSION_HOURS = 12;

const enc = new TextEncoder();
const dec = new TextDecoder();

export type SessionPayload = {
  /** Expiry, ms since epoch. Signed, so it cannot be extended by the holder. */
  exp: number;
  /** admin_users.id. Absent in shared-password mode. */
  sub?: string;
  email?: string;
  name?: string;
};

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
 * FAILS CLOSED. Without a session secret the console is unreachable rather than
 * unprotected. A password is only required in shared mode; with the database
 * configured, identity comes from an emailed code instead.
 */
export function isConfigured(): boolean {
  return adminSecret() !== null;
}

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return dec.decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
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

/** Token is `<base64url payload>.<hmac>`, so identity and expiry are both signed. */
export async function signSession(
  secret: string,
  identity: Omit<SessionPayload, "exp"> = {},
  hours = SESSION_HOURS
): Promise<string> {
  const payload = JSON.stringify({ ...identity, exp: Date.now() + hours * 3600 * 1000 });
  const body = toB64Url(enc.encode(payload));
  return `${body}.${await hmac(body, secret)}`;
}

/** Returns the payload on a valid, unexpired session, or null. Never throws. */
export async function readSession(
  token: string | undefined,
  secret: string
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, await hmac(body, secret))) return null;
  try {
    const payload = JSON.parse(fromB64Url(body)) as SessionPayload;
    if (typeof payload?.exp !== "number" || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifySession(token: string | undefined, secret: string): Promise<boolean> {
  return (await readSession(token, secret)) !== null;
}

/** Pull the admin cookie out of a raw request, for routes behind the proxy. */
export function adminCookieFrom(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ADMIN_COOKIE) return rest.join("=");
  }
  return undefined;
}
