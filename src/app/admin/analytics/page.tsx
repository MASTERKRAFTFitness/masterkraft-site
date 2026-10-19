import type { Metadata } from "next";
import Link from "next/link";
import TrendChart from "@/components/admin/TrendChart";
import AdminTabs from "@/components/admin/AdminTabs";
import { identityMode } from "@/lib/admin-db";
import {
  rangeFor,
  reportingStatus,
  searchReport,
  serviceAccountEmail,
  trafficReport,
  type SearchReport,
  type TrafficReport,
} from "@/lib/google-reporting";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

// Live from Google on every load. Internal and low-traffic, so there is nothing
// worth caching, and a stale number on a dashboard is worse than a slow one.
export const dynamic = "force-dynamic";

const RANGES = [7, 28, 90] as const;

const int = (n: number) => n.toLocaleString("en-AU", { maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const pos = (n: number) => (n ? n.toFixed(1) : "–");

// Change against the previous period of the same length, as a percentage.
function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <span className="text-xs text-ash">no prior data</span>;
  const change = (now - before) / before;
  if (Math.abs(change) < 0.005) return <span className="text-xs text-ash">no change</span>;
  const good = change > 0;
  return (
    <span className={`text-xs tabular-nums ${good ? "text-emerald-700" : "text-accent"}`}>
      {good ? "▲" : "▼"} {Math.abs(change * 100).toFixed(0)}%
      <span className="sr-only">{good ? " up" : " down"} on the previous period</span>
    </span>
  );
}

// Average position moves in places, and a smaller number is better, so a
// percentage and a down-arrow would both read backwards. 21.2 -> 18.4 is
// "up 2.8 places".
function PositionDelta({ now, before }: { now: number; before: number }) {
  if (!before || !now) return <span className="text-xs text-ash">no prior data</span>;
  const gained = before - now;
  if (Math.abs(gained) < 0.05) return <span className="text-xs text-ash">no change</span>;
  return (
    <span className={`text-xs tabular-nums ${gained > 0 ? "text-emerald-700" : "text-accent"}`}>
      {gained > 0 ? "▲" : "▼"} {Math.abs(gained).toFixed(1)} places
    </span>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="border border-line bg-white px-4 py-3">
      <div className="font-mono text-[0.62rem] uppercase tracking-wider text-ash">{label}</div>
      <div className="mt-1 font-display text-2xl text-ink tabular-nums">{value}</div>
      <div className="mt-0.5 h-4">{children}</div>
    </div>
  );
}

function Panel({ title, note, children, className = "" }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border border-line bg-white p-4 ${className}`}>
      <header className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-sm uppercase tracking-wide text-ink">{title}</h2>
        {note && <span className="text-xs text-ash">{note}</span>}
      </header>
      {children}
    </section>
  );
}

// Horizontal bars, one series. The value is printed beside every bar, so the
// bar length is a reading aid rather than the only way to get the number.
function Bars({ rows }: { rows: { label: string; value: number; detail?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.every((r) => !r.value)) return <p className="py-6 text-center text-sm text-ash">No data in this range.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7.5rem_1fr_4rem] items-center gap-3 text-sm" title={r.detail}>
          <span className="truncate text-ink">{r.label}</span>
          <span className="h-3 bg-smoke">
            <span className="block h-3 rounded-r bg-ink" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-ash">{int(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

const th = "px-3 py-2 font-mono text-[0.62rem] uppercase tracking-wider text-ash";
const td = "px-3 py-2 tabular-nums";

function Failed({ what, error }: { what: string; error: string }) {
  return (
    <p className="border border-accent/40 bg-smoke px-4 py-3 text-sm text-ink">
      <strong>{what} did not load.</strong> <span className="font-mono text-xs text-ash">{error}</span>
    </p>
  );
}

function Setup({ missing }: { missing: string[] }) {
  return (
    <div className="border border-line bg-smoke px-5 py-4 text-sm text-ink">
      <p className="font-semibold">Not connected to Google yet.</p>
      <p className="mt-1 text-ash">
        Set {missing.map((m, i) => (
          <span key={m}>
            {i ? " and " : ""}
            <code className="font-mono text-ink">{m}</code>
          </span>
        ))}{" "}
        in <code className="font-mono">.env.local</code> and Vercel, then redeploy. See{" "}
        <code className="font-mono">docs/analytics-dashboard.md</code> for the five-minute setup.
      </p>
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const asked = Number((await searchParams).range);
  const days = (RANGES as readonly number[]).includes(asked) ? asked : 28;
  const range = rangeFor(days);
  const status = reportingStatus();

  const [traffic, search] = await Promise.allSettled([
    status.ga4 ? trafficReport(range) : Promise.reject(new Error("not configured")),
    status.gsc ? searchReport(range) : Promise.reject(new Error("not configured")),
  ]);
  const t: TrafficReport | null = traffic.status === "fulfilled" ? traffic.value : null;
  const s: SearchReport | null = search.status === "fulfilled" ? search.value : null;
  const why = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : "");
  const prevLabel = `Previous ${days} days`;

  return (
    <section className="container-mk pt-28 pb-16">
      <AdminTabs full={identityMode() === "supabase"} />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-wide text-ink">Web analytics</h1>
          <p className="text-sm text-ash">
            masterkraft.com · {range.start} to {range.end}, against the {days} days before. Google Analytics and Search Console.
          </p>
        </div>
        <nav className="flex border border-line text-xs" aria-label="Date range">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/admin/analytics?range=${r}`}
              aria-current={r === days ? "page" : undefined}
              className={`px-3 py-1.5 font-mono uppercase tracking-wider ${r === days ? "bg-ink text-white" : "text-ash hover:text-ink"}`}
            >
              {r} days
            </Link>
          ))}
        </nav>
      </header>

      {status.missing.length > 0 && <Setup missing={status.missing} />}

      {(t || s) && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {s && (
            <>
              <Tile label="Organic clicks" value={int(s.totals.clicks)}>
                <Delta now={s.totals.clicks} before={s.prevTotals.clicks} />
              </Tile>
              <Tile label="Keywords" value={int(s.totals.keywords)}>
                <Delta now={s.totals.keywords} before={s.prevTotals.keywords} />
              </Tile>
              <Tile label="Avg position" value={pos(s.totals.position)}>
                <PositionDelta now={s.totals.position} before={s.prevTotals.position} />
              </Tile>
            </>
          )}
          {t && (
            <>
              <Tile label="Visitors" value={int(t.totals.users)}>
                <Delta now={t.totals.users} before={t.prevTotals.users} />
              </Tile>
              <Tile label="Sessions" value={int(t.totals.sessions)}>
                <Delta now={t.totals.sessions} before={t.prevTotals.sessions} />
              </Tile>
              <Tile label="Key events" value={int(t.totals.keyEvents)}>
                <Delta now={t.totals.keyEvents} before={t.prevTotals.keyEvents} />
              </Tile>
              <Tile label="Revenue" value={aud(t.totals.revenue)}>
                <Delta now={t.totals.revenue} before={t.prevTotals.revenue} />
              </Tile>
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {status.ga4 && (
          <Panel title="Website traffic" note="Sessions per day">
            {t ? (
              <TrendChart
                unit="sessions"
                prevLabel={prevLabel}
                points={t.daily.map((d) => ({ label: d.date, value: d.sessions, prev: d.prevSessions }))}
              />
            ) : (
              <Failed what="Google Analytics" error={why(traffic)} />
            )}
          </Panel>
        )}
        {status.gsc && (
          <Panel title="Organic search" note="Clicks from Google per day">
            {s ? (
              <TrendChart unit="clicks" points={s.daily.map((d) => ({ label: d.date, value: d.clicks }))} />
            ) : (
              <Failed what="Search Console" error={why(search)} />
            )}
          </Panel>
        )}

        {s && (
          <Panel title="Keyword positions" note="Keywords by Google ranking">
            <Bars rows={s.positions.map((p) => ({ label: p.band, value: p.keywords }))} />
          </Panel>
        )}
        {t && (
          <Panel title="Traffic channels" note="Sessions">
            <Bars
              rows={t.channels.map((c) => ({
                label: c.name,
                value: c.sessions,
                detail: `${int(c.sessions)} sessions, ${int(c.keyEvents)} key events`,
              }))}
            />
          </Panel>
        )}

        {s && (
          <Panel title="Top keywords" note={`${int(s.totals.keywords)} ranking`} className="lg:col-span-2">
            {s.keywords.length === 0 ? (
              <p className="py-6 text-center text-sm text-ash">No search queries recorded in this range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className={th}>Keyword</th>
                      <th className={`${th} text-right`}>Position</th>
                      <th className={`${th} text-right`}>Clicks</th>
                      <th className={`${th} text-right`}>Impressions</th>
                      <th className={`${th} text-right`}>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.keywords.map((k) => (
                      <tr key={k.query} className="border-b border-line last:border-0">
                        <td className="px-3 py-2 text-ink">{k.query}</td>
                        <td className={`${td} text-right text-ink`}>{pos(k.position)}</td>
                        <td className={`${td} text-right text-ink`}>{int(k.clicks)}</td>
                        <td className={`${td} text-right text-ash`}>{int(k.impressions)}</td>
                        <td className={`${td} text-right text-ash`}>{pct(k.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        {t && (
          <Panel title="Top pages" note="Views">
            <table className="w-full text-sm">
              <tbody>
                {t.pages.map((p) => (
                  <tr key={p.path} className="border-b border-line last:border-0">
                    <td className="w-full max-w-0 truncate py-2 pr-3 font-mono text-xs text-ink" title={p.path}>{p.path}</td>
                    <td className="py-2 text-right tabular-nums text-ash">{int(p.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
        {s && (
          <Panel title="Top pages in Google" note="Clicks · avg position">
            <table className="w-full text-sm">
              <tbody>
                {s.pages.map((p) => (
                  <tr key={p.page} className="border-b border-line last:border-0">
                    <td className="w-full max-w-0 truncate py-2 pr-3 font-mono text-xs text-ink" title={p.page}>{p.page}</td>
                    <td className="py-2 text-right tabular-nums text-ink">{int(p.clicks)}</td>
                    <td className="w-14 py-2 text-right tabular-nums text-ash">{pos(p.position)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        {t && (
          <Panel title="Shop funnel" note="Events in this range" className="lg:col-span-2">
            <Bars rows={t.events.map((e) => ({ label: e.name.replace(/_/g, " "), value: e.count }))} />
          </Panel>
        )}
      </div>

      {serviceAccountEmail() && (
        <p className="mt-6 text-xs text-ash">
          Reading as <span className="font-mono">{serviceAccountEmail()}</span>. Search Console data runs two to three days behind.
        </p>
      )}
    </section>
  );
}
