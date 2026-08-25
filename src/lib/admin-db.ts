// Postgres access for the admin console, through Supabase.
//
// SERVER ONLY. This uses the service role key, which bypasses RLS. Every table
// it touches has RLS enabled with no policies, so the service role is the only
// thing that can read them at all and a browser never can. Do not import this
// from a client component.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function adminDbConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Returns null rather than throwing when unconfigured, so the console can fall
 * back to shared-password mode instead of failing shut. See identityMode().
 */
export function adminDb(): SupabaseClient | null {
  if (!adminDbConfigured()) return null;
  cached ??= createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return cached;
}

/**
 * Which identity system is live.
 *
 * `supabase` gives per-person identity and a real audit trail. `shared` is the
 * original one-password mode, kept so the console keeps working before the
 * database exists and so a database outage does not lock the team out of their
 * own order lookups. The console says which mode it is in, because in `shared`
 * mode nothing can answer "who approved this".
 */
export function identityMode(): "supabase" | "shared" {
  return adminDbConfigured() ? "supabase" : "shared";
}

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
};
