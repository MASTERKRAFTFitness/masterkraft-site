import type { Metadata } from "next";
import Link from "next/link";
import { identityMode } from "@/lib/admin-db";
import { recentActivity } from "@/lib/agent/audit";

export const metadata: Metadata = {
  title: "Activity",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const DECISION_STYLE: Record<string, string> = {
  approved: "text-ink border-ink",
  declined: "text-ash border-line",
  // Proposed and never decided. Deliberately the loud one: it means the agent
  // wanted to contact a customer and nobody ever said yes or no.
  proposed: "text-accent border-accent",
};

function when(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ActivityPage() {
  const mode = identityMode();
  const rows = mode === "supabase" ? await recentActivity(50) : [];

  return (
    <section className="container-mk pt-28 pb-16">
      <header className="mb-6">
        <Link href="/admin" className="text-xs text-ash underline underline-offset-2 hover:text-ink">
          Back to the desk
        </Link>
        <h1 className="mt-3 font-display text-2xl uppercase tracking-wide text-ink">Activity</h1>
        <p className="text-sm text-ash">
          Every action the agent proposed that would reach outside the building, and what a person
          decided. Read only.
        </p>
      </header>

      {mode === "shared" ? (
        <p className="border border-line bg-smoke px-4 py-3 text-sm text-ink">
          No audit trail in shared password mode. Configure the database to record who approved what.
        </p>
      ) : rows.length === 0 ? (
        <p className="border border-line bg-smoke px-4 py-3 text-sm text-ash">
          Nothing yet. Actions appear here the moment the agent proposes one.
        </p>
      ) : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-line bg-smoke text-left">
                <th className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">When</th>
                <th className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">Who</th>
                <th className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">Action</th>
                <th className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">Detail</th>
                <th className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-ash tabular-nums">{when(row.proposed_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-ink">{row.user_email}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-ink">{row.tool_name}</td>
                  <td className="px-4 py-3 text-ash">
                    {String(row.input?.to ?? row.input?.email ?? "")}
                    {row.input?.subject ? ` — ${String(row.input.subject)}` : ""}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-block border px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-wider ${
                        DECISION_STYLE[row.decision] ?? "text-ash border-line"
                      }`}
                    >
                      {row.decision === "proposed" ? "never decided" : row.decision}
                    </span>
                    {row.decided_at && (
                      <span className="ml-2 text-xs text-ash tabular-nums">{when(row.decided_at)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
