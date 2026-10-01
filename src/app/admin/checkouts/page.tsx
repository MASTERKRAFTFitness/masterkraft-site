import type { Metadata } from "next";
import Link from "next/link";
import { identityMode } from "@/lib/admin-db";
import { recentCheckoutLeads, type CheckoutStatus } from "@/lib/checkout-leads";

export const metadata: Metadata = {
  title: "Checkouts",
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

const LABEL: Record<CheckoutStatus, { text: string; hot: boolean }> = {
  quoted: { text: "left at freight", hot: true },
  payment_started: { text: "left at payment", hot: true },
  paid: { text: "paid", hot: false },
  quote_requested: { text: "quote requested", hot: false },
};

export default async function CheckoutsPage() {
  const mode = identityMode();
  const rows = mode === "supabase" ? await recentCheckoutLeads(200) : [];
  const abandoned = rows.filter((r) => r.status === "quoted" || r.status === "payment_started");

  return (
    <section className="container-mk pt-28 pb-16">
      <header className="mb-6">
        <Link href="/admin" className="text-xs text-ash underline underline-offset-2 hover:text-ink">
          Back to the desk
        </Link>
        <h1 className="mt-3 font-display text-2xl uppercase tracking-wide text-ink">Checkouts</h1>
        <p className="max-w-2xl text-sm text-ash">
          Every card checkout that got as far as a freight quote, most recent first. Ones still at
          &ldquo;left at freight&rdquo; or &ldquo;left at payment&rdquo; an hour on are emailed to the team once.
          Read only; kept 90 days.
        </p>
      </header>

      {mode === "shared" ? (
        <p className="border border-line bg-smoke px-4 py-3 text-sm text-ink">
          No database configured, so nothing is being recorded.
        </p>
      ) : rows.length === 0 ? (
        <p className="border border-line bg-smoke px-4 py-3 text-sm text-ash">
          Nothing yet. Either the migration has not been applied, or nobody has quoted freight since this shipped.
        </p>
      ) : (
        <>
          <p className="mb-4 font-mono text-xs uppercase tracking-wider text-ash">
            {rows.length} checkouts · {abandoned.length} abandoned ·{" "}
            {rows.filter((r) => r.status === "paid").length} paid
          </p>
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-smoke text-left">
                  {["When", "Stage", "Customer", "Delivery", "Cart", "Freight shown", "Emailed"].map((h) => (
                    <th key={h} className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const label = LABEL[row.status] ?? { text: row.status, hot: false };
                  return (
                    <tr key={row.checkout_id} className="border-b border-line last:border-0 align-top">
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-ash">{when(row.updated_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block border px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-wider ${
                            label.hot ? "border-accent text-accent" : "border-line text-ash"
                          }`}
                        >
                          {label.text}
                        </span>
                        {row.order_number && <span className="block mt-1 font-mono text-xs text-ash">#{row.order_number}</span>}
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {row.name}
                        {row.company && <span className="text-ash"> ({row.company})</span>}
                        {row.email && (
                          <a href={`mailto:${row.email}`} className="block text-xs text-ash underline underline-offset-2">
                            {row.email}
                          </a>
                        )}
                        {row.phone && <span className="block text-xs text-ash">{row.phone}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-ash">{[row.suburb, row.state, row.postcode].filter(Boolean).join(" ")}</td>
                      <td className="px-4 py-3 text-xs text-ink">
                        {(row.items ?? []).map((i, n) => (
                          <span key={n} className="block">
                            {i.qty}× {i.name}
                          </span>
                        ))}
                        {row.subtotal != null && <span className="block mt-1 font-mono text-ash">{aud.format(row.subtotal)}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {row.freight_price != null ? (
                          <span className="font-mono text-ink">
                            {aud.format(row.freight_price)}
                            {row.freight_label && <span className="block font-sans text-ash">{row.freight_label}</span>}
                          </span>
                        ) : (
                          <span className="text-accent">not priced{row.freight_reason ? ` (${row.freight_reason})` : ""}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-ash">{when(row.notified_at)}</td>
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
