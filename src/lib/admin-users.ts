// Staff identity for the /admin console.
//
// No passwords. Identity IS the work email, proven by a six-digit code sent to
// it. Nothing to rotate, nothing for anyone to reuse from another site, and when
// somebody leaves the business their mailbox goes and so does their access.
//
// The code is delivered through Resend, which this app already uses for quotes
// and is proven working. Supabase Auth's own magic link would also work, but it
// would mean a second identity system alongside the signed cookie the proxy
// already checks, and its built-in sender is rate limited too hard for real use
// (it would need custom SMTP pointed at Resend anyway). Delivery is contained in
// sendLoginCode below, so swapping it is a one-function change.

import { adminDb, type AdminUser } from "@/lib/admin-db";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

/**
 * Solves the chicken and egg: with an empty admin_users table nobody can sign
 * in to create the first user. Emails listed here are created on first
 * successful code entry. Kept in Vercel rather than the repo, so the list is not
 * public and does not need a deploy to change.
 */
function bootstrapEmails(): string[] {
  return (process.env.ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function normalise(email: string): string {
  return email.trim().toLowerCase();
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Six digits from the CSPRNG, not Math.random. Rejection sampling keeps it uniform. */
function generateCode(): string {
  const max = 1_000_000;
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(n % max).padStart(6, "0");
}

export async function findUser(email: string): Promise<AdminUser | null> {
  const db = adminDb();
  if (!db) return null;
  const { data } = await db
    .from("admin_users")
    .select("id, email, name, is_active")
    .eq("email", normalise(email))
    .maybeSingle();
  return (data as AdminUser) ?? null;
}

/**
 * Issue a login code. Always resolves the same way whether or not the address
 * belongs to a staff member, so this cannot be used to enumerate who works here.
 */
export async function requestLoginCode(email: string): Promise<{ sent: boolean }> {
  const db = adminDb();
  if (!db) return { sent: false };
  const addr = normalise(email);

  const user = await findUser(addr);
  const allowed = (user?.is_active ?? false) || bootstrapEmails().includes(addr);
  if (!allowed) return { sent: true }; // deliberately indistinguishable

  const code = generateCode();
  const { error } = await db.from("admin_login_codes").insert({
    email: addr,
    code_hash: await sha256(code),
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
  });
  if (error) {
    console.error("[admin-users] could not store login code", error);
    return { sent: false };
  }

  await sendLoginCode(addr, code);
  return { sent: true };
}

async function sendLoginCode(email: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("[admin-users] cannot send login code: Resend is not configured");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${code} is your MasterKraft support desk code`,
      text: `Your sign in code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.\n\nIf you did not ask for this, ignore it and tell whoever runs the site.`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6">
        <p>Your sign in code for the MasterKraft support desk:</p>
        <p style="font-size:30px;letter-spacing:.18em;font-weight:700;margin:18px 0">${code}</p>
        <p style="color:#555">It expires in ${CODE_TTL_MINUTES} minutes. If you did not ask for this, ignore it and tell whoever runs the site.</p>
      </div>`,
    }),
  });
  if (!res.ok) console.error("[admin-users] Resend rejected the login code", res.status);
}

export type VerifyResult =
  | { ok: true; user: AdminUser }
  | { ok: false; reason: "invalid" | "expired" | "too_many" | "unavailable" };

/**
 * Exchange a code for a user. Consumes the code on success AND on running out
 * of attempts, so a burnt code cannot be retried by requesting a fresh window.
 */
export async function verifyLoginCode(email: string, code: string): Promise<VerifyResult> {
  const db = adminDb();
  if (!db) return { ok: false, reason: "unavailable" };
  const addr = normalise(email);

  const { data: row } = await db
    .from("admin_login_codes")
    .select("id, code_hash, expires_at, consumed_at, attempts")
    .eq("email", addr)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return { ok: false, reason: "invalid" };
  if (new Date(row.expires_at as string).getTime() < Date.now()) return { ok: false, reason: "expired" };
  if ((row.attempts as number) >= MAX_ATTEMPTS) return { ok: false, reason: "too_many" };

  if ((await sha256(code.trim())) !== row.code_hash) {
    const attempts = (row.attempts as number) + 1;
    await db
      .from("admin_login_codes")
      .update({
        attempts,
        // Burn it outright once the budget is gone, rather than leaving a row
        // that a slower attacker could keep grinding at.
        consumed_at: attempts >= MAX_ATTEMPTS ? new Date().toISOString() : null,
      })
      .eq("id", row.id);
    return { ok: false, reason: attempts >= MAX_ATTEMPTS ? "too_many" : "invalid" };
  }

  await db.from("admin_login_codes").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

  let user = await findUser(addr);
  if (!user && bootstrapEmails().includes(addr)) {
    const { data } = await db
      .from("admin_users")
      .insert({ email: addr, name: addr.split("@")[0] })
      .select("id, email, name, is_active")
      .single();
    user = (data as AdminUser) ?? null;
  }
  if (!user || !user.is_active) return { ok: false, reason: "invalid" };

  await db.from("admin_users").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
  return { ok: true, user };
}
