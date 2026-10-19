import type { Metadata } from "next";
import { identityMode } from "@/lib/admin-db";
import { marginPercent } from "@/lib/freight";
import { customerPrice, listLevyMatrices, recentLevyChanges } from "@/lib/fuel-levy";
import FuelLevyForm from "@/components/admin/FuelLevyForm";
import AdminTabs from "@/components/admin/AdminTabs";

export const metadata: Metadata = {
  title: "Freight",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

// A round carrier charge to show what the levy does to a checkout price.
const EXAMPLE_CHARGE = 500;

function when(value: string) {
  return new Date(value).toLocaleString("en-AU", {
    timeZone: "Australia/Melbourne",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function FreightPage() {
  const mode = identityMode();
  const [matrices, changes] =
    mode === "supabase" ? await Promise.all([listLevyMatrices(), recentLevyChanges(30)]) : [[], null];
  const margin = marginPercent();
  const costCards = matrices.filter((m) => m.basis === "cost");
  const nameOf = new Map(matrices.map((m) => [m.code, m.carrier]));

  return (
    <section className="container-mk pt-28 pb-16">
      <AdminTabs full={identityMode() === "supabase"} />
      <header className="mb-6">
        <h1 className="font-display text-2xl uppercase tracking-wide text-ink">Freight</h1>
        <p className="max-w-2xl text-sm text-ash">
          The fuel levy on each carrier rate card. It is added to the carrier&rsquo;s charge before our{" "}
          {margin}% margin and GST, on every price checkout quotes from that card. Mainfreight&rsquo;s changes
          weekly: enter the figure from their latest fuel (FAF) letter. A change is live at checkout within a minute.
        </p>
      </header>

      {mode === "shared" ? (
        <p className="border border-line bg-smoke px-4 py-3 text-sm text-ink">
          No database configured, so there are no rate cards to edit.
        </p>
      ) : costCards.length === 0 ? (
        <p className="border border-line bg-smoke px-4 py-3 text-sm text-ash">
          No carrier rate cards found. Either the freight matrix migration has not been applied, or no card is loaded.
        </p>
      ) : (
        <div className="space-y-4">
          {costCards.map((m) => (
            <article key={m.code} className="border border-line p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg uppercase tracking-wide text-ink">{m.name}</h2>
                <span
                  className={`inline-block border px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-wider ${
                    m.active ? "border-accent text-accent-600" : "border-line text-ash"
                  }`}
                >
                  {m.active ? "live at checkout" : "switched off"}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink">
                Current levy: <span className="font-mono text-base">{m.fuelLevyPercent}%</span>
              </p>
              <p className="mt-1 text-xs text-ash">
                Example: a {aud.format(EXAMPLE_CHARGE)} {m.carrier} charge is{" "}
                <span className="font-mono text-ink">
                  {aud.format(customerPrice(EXAMPLE_CHARGE, m.fuelLevyPercent, margin))}
                </span>{" "}
                at checkout. Each 1% of levy moves it by about{" "}
                {aud.format(customerPrice(EXAMPLE_CHARGE, 1, margin) - customerPrice(EXAMPLE_CHARGE, 0, margin))}.
              </p>
              <FuelLevyForm code={m.code} current={m.fuelLevyPercent} />
            </article>
          ))}
        </div>
      )}

      {mode === "supabase" && (
        <div className="mt-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-ash">Change history</h2>
          {changes === null ? (
            <p className="border border-line bg-smoke px-4 py-3 text-sm text-ash">
              The change history table is missing. Apply{" "}
              <code className="font-mono">supabase/migrations/20261013_freight_fuel_levy_changes.sql</code>. Levy
              changes still work without it, they just are not logged.
            </p>
          ) : changes.length === 0 ? (
            <p className="border border-line bg-smoke px-4 py-3 text-sm text-ash">No changes made from this screen yet.</p>
          ) : (
            <div className="overflow-x-auto border border-line">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-line bg-smoke text-left">
                    {["When", "Card", "Levy", "By", "Note"].map((h) => (
                      <th key={h} className="px-4 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-ash">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-0 align-top">
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-ash">{when(c.createdAt)}</td>
                      <td className="px-4 py-3 text-ink">{nameOf.get(c.matrixCode) ?? c.matrixCode}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-ink">
                        {c.oldPercent === null ? "" : `${c.oldPercent}% → `}
                        {c.newPercent}%
                      </td>
                      <td className="px-4 py-3 text-xs text-ash">{c.changedByEmail ?? "unknown"}</td>
                      <td className="px-4 py-3 text-xs text-ash">{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
