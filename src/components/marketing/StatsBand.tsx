import { stats } from "@/lib/usps";

export default function StatsBand() {
  return (
    <section className="bg-carbon text-white border-y border-white/10">
      <div className="container-mk grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/10">
        {stats.map((s) => (
          <div key={s.label} className="px-6 py-10 lg:py-14">
            <p className="font-display text-5xl lg:text-6xl font-bold text-accent leading-none">
              {s.value}
            </p>
            <p className="mt-4 font-display uppercase tracking-wide text-sm">{s.label}</p>
            <p className="mt-1 text-white/50 text-xs font-mono tracking-wide">{s.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
