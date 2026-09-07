import type { Metadata } from "next";
import Link from "next/link";
import { identityMode } from "@/lib/admin-db";
import { busiestNotFound } from "@/lib/not-found-log";

export const metadata: Metadata = {
  title: "Dead links",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function when(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// The question this page exists to answer is "is this worth a redirect", and the
// honest answer usually turns on who is asking. A crawler finding a dead URL
// means it is still indexed; a person finding it means something out there still
// links to it and someone just failed to buy something.
const CRAWLER = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless/i;

function who(userAgent: string | null) {
  if (!userAgent) return { label: "unknown", crawler: false };
  if (/googlebot/i.test(userAgent)) return { label: "Googlebot", crawler: true };
  if (/bingbot/i.test(userAgent)) return { label: "Bingbot", crawler: true };
  if (CRAWLER.test(userAgent)) return { label: "crawler", crawler: true };
  return { label: "person", crawler: false };
}

export default async function DeadLinksPage() {
  const mode = identityMode();
  const rows = mode === "supabase" ? await busiestNotFound(200) : [];
  const people = rows.filter((r) => !who(r.last_user_agent).crawler);

  return (
    <section className="container-mk pt-28 pb-16">
      <header className="mb-6">
        <Link href="/admin" className="text-xs text-ash underline underline-offset-2 hover:text-ink">
          Back to the desk
        </Link>
        <h1 className="mt-3 font-display text-2xl uppercase tracking-wide text-ink">Dead links</h1>
        <p className="max-w-2xl text-sm text-ash">
          URLs the outside world asked for and this site does not have, busiest first. The 362
          WordPress-era URLs already in the redirect map never reach here — everything on this page
          is a dead link nobody has accounted for yet. Read only.
        </p>
      </header>

      {mode === "shared" ? (
        <p className="border border-line bg-smoke px-4 py-3 text-sm text-ink">
          No database configured, so nothing is being recorded. Set <code>SUPABASE_URL</code> and{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> to start collecting.
        </p>
      ) : rows.length === 0 ? (
        <p className="border border-line bg-smoke px-4 py-3 text-sm text-ash">
          Nothing yet. Either the migration has not been applied, or — less likely — every URL
          anyone has asked for since this shipped exists.
        </p>
      ) : (
        <>
          <p className="mb-4 font-mono text-xs uppercase tracking-wider text-ash">
            {rows.length} distinct paths · {rows.reduce((n, r) => n + r.hits, 0).toLocaleString()} hits ·{" "}
            {people.length} last requested by a person
          </p>
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-smoke text-left">
                  <th className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">Path</th>
                  <th className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">Hits</th>
                  <th className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">Last asked</th>
                  <th className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">By</th>
                  <th className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">Referrer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const asker = who(row.last_user_agent);
                  return (
                    <tr key={row.path} className="border-b border-line last:border-0 align-top">
                      <td className="px-4 py-3 font-mono text-xs break-all text-ink">{row.path}</td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-ink">{row.hits.toLocaleString()}</td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-ash">{when(row.last_seen_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block border px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-wider ${
                            asker.crawler ? "border-line text-ash" : "border-accent text-accent"
                          }`}
                        >
                          {asker.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 break-all text-xs text-ash">{row.last_referrer ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
