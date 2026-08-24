import type { Metadata } from "next";
import AgentConsole from "@/components/admin/AgentConsole";
import SignOutButton from "@/components/admin/SignOutButton";

export const metadata: Metadata = {
  title: "Support desk",
  robots: { index: false, follow: false },
};

// Reads live order and stock data on every message, so nothing here is static.
export const dynamic = "force-dynamic";

export default function AdminPage() {
  const missingKey = !process.env.ANTHROPIC_API_KEY;

  return (
    // The site header is position:fixed at 76px, so the console has to clear it.
    <section className="container-mk pt-28 pb-8">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-wide text-ink">Support desk</h1>
          <p className="text-sm text-ash">Products, orders, stock and delivery. Internal use only.</p>
        </div>
        <SignOutButton />
      </header>

      {missingKey && (
        <p className="mb-4 border border-accent/40 bg-smoke px-4 py-3 text-sm text-ink">
          <strong>ANTHROPIC_API_KEY is not set.</strong> Add it to <code className="font-mono">.env.local</code>{" "}
          and to Vercel Production, then redeploy. The console will not answer until then.
        </p>
      )}

      <AgentConsole />
    </section>
  );
}
