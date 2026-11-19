import type { Metadata } from "next";
import { identityMode } from "@/lib/admin-db";
import { recentAdClickLeads } from "@/lib/ad-click-leads";
import { OFFLINE_LEAD_NAME, OFFLINE_PURCHASE_NAME, skipReason, type SkipReason } from "@/lib/ad-offline-export";
import AdminTabs from "@/components/admin/AdminTabs";

export const metadata: Metadata = {
  title: "Ad clicks",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

function when(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-AU", {
    timeZone: "Australia/Melbourne",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const KIND: Record<string, string> = { checkout: "card checkout", quote: "quote request", brief: "fitout brief" };

const SKIP: Record<SkipReason, string> = {
  consented: "counted by the tag",
  no_gclid: "iOS click, no gclid",
  exported: "uploaded",
  not_converted: "not paid",
};

export default async function AdClicksPage() {
  const mode = identityMode();
  const rows = mode === "supabase" ? await recentAdClickLeads(90) : [];
  const ready = rows.filter((r) => skipReason(r) === null);

  return (
    <section className="container-mk pt-28 pb-16">
      <AdminTabs full={mode === "supabase"} />
      <header className="mb-6">
        <h1 className="font-display text-2xl uppercase tracking-wide text-ink">Ad clicks</h1>
        <p className="max-w-2xl text-sm text-ash">
          Leads and orders from visitors who arrived on a Google ad. Most never accept cookies, so Google Ads cannot
          count them itself. Download the CSV and upload it in Google Ads under Goals &rsaquo; Conversions &rsaquo;
          Uploads. Quotes and fitout briefs go to &ldquo;{OFFLINE_LEAD_NAME}&rdquo;, paid card orders to &ldquo;
          {OFFLINE_PURCHASE_NAME}&rdquo;. Downloading marks those rows uploaded, so each is sent once. Last 90 days.
        </p>
      </header>

      {mode === "shared" ? (
        <p className="border border-line bg-smoke px-4 py-3 text-sm text-ink">
          No database configured, so nothing is being recorded.
        </p>
      ) : (
        <>
          <form method="post" action="/api/admin/ad-clicks" className="mb-6 flex items-center gap-4">
            <button
              type="submit"
              disabled={ready.length === 0}
              className="bg-ink px-4 py-2 font-mono text-xs uppercase tracking-wider text-white disabled:opacity-40"
            >
              Download CSV ({ready.length} ready)
            </button>
            <span className="text-xs text-ash">
              {rows.length} with a click · {rows.filter((r) => r.exported_at).length} already uploaded
            </span>
          </form>

          {rows.length === 0 ? (
            <p className="border border-line bg-smoke px-4 py-3 text-sm text-ash">
              Nothing yet. Either the migration has not been applied, or no ad visitor has asked for a quote or
              checked out since this shipped.
            </p>
          ) : (
            <div className="overflow-x-auto border border-line">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-line bg-smoke text-left">
                    {["Lead", "What", "Customer", "Value", "Ad click", "Upload"].map((h) => (
                      <th key={h} className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const skip = skipReason(row);
                    return (
                      <tr key={`${row.kind}:${row.ref}`} className="border-b border-line last:border-0 align-top">
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums text-ash">{when(row.created_at)}</td>
                        <td className="px-4 py-3 text-ink">
                          {KIND[row.kind] ?? row.kind}
                          {row.kind === "checkout" && (
                            <span className="block text-xs text-ash">
                              {row.checkout_status ?? "unknown"}
                              {row.order_number ? ` · #${row.order_number}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-ash">{row.email}</td>
                        <td className="px-4 py-3 font-mono text-xs text-ink">
                          {row.value != null ? aud.format(row.value) : ""}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-ash">{when(row.clicked_at)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-block border px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-wider ${
                              skip ? "border-line text-ash" : "border-accent text-accent"
                            }`}
                          >
                            {skip ? SKIP[skip] : "ready"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
