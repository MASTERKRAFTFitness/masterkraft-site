import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminSecret, readSession } from "@/lib/admin-auth";
import { identityMode } from "@/lib/admin-db";
import AgentConsole from "@/components/admin/AgentConsole";
import SignOutButton from "@/components/admin/SignOutButton";

export const metadata: Metadata = {
  title: "Support desk",
  robots: { index: false, follow: false },
};

// Reads live order and stock data on every message, so nothing here is static.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const missingKey = !process.env.ANTHROPIC_API_KEY;
  const secret = adminSecret();
  const session = secret ? await readSession((await cookies()).get(ADMIN_COOKIE)?.value, secret) : null;
  const mode = identityMode();

  return (
    // The site header is position:fixed at 76px, so the console has to clear it.
    <section className="container-mk pt-28 pb-8">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-wide text-ink">Support desk</h1>
          <p className="text-sm text-ash">Products, orders, stock and delivery. Internal use only.</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-ash">
          {mode === "supabase" && (
            <Link href="/admin/activity" className="underline underline-offset-2 hover:text-ink transition-colors">
              Activity
            </Link>
          )}
          {session?.email && <span className="font-mono">{session.email}</span>}
          <SignOutButton />
        </div>
      </header>

      {missingKey && (
        <p className="mb-4 border border-accent/40 bg-smoke px-4 py-3 text-sm text-ink">
          <strong>ANTHROPIC_API_KEY is not set.</strong> Add it to <code className="font-mono">.env.local</code>{" "}
          and to Vercel Production, then redeploy. The console will not answer until then.
        </p>
      )}

      {mode === "shared" && (
        <p className="mb-4 border border-line bg-smoke px-4 py-3 text-sm text-ink">
          <strong>Shared password mode.</strong> Nothing here can be attributed to a person and no
          record is kept of what was approved. Set <code className="font-mono">SUPABASE_URL</code> and{" "}
          <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to turn on per-person sign in
          and the audit trail.
        </p>
      )}

      <AgentConsole />
    </section>
  );
}
