import Eyebrow from "@/components/ui/Eyebrow";
import { usps } from "@/lib/usps";

export default function UspGrid({
  eyebrow = "The MasterKraft Difference",
  title = "Why operators choose MasterKraft",
}: {
  eyebrow?: string;
  title?: string;
}) {
  return (
    <section className="container-mk py-20">
      <div className="max-w-2xl mb-14">
        <Eyebrow className="mb-4">{eyebrow}</Eyebrow>
        <h2 className="text-3xl lg:text-4xl font-bold">{title}</h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line">
        {usps.map((u) => (
          <div key={u.n} className="bg-white p-8 group">
            <span className="font-mono text-sm text-accent tracking-widest">{u.n}</span>
            <h3 className="mt-4 text-xl font-bold">{u.title}</h3>
            <p className="mt-3 text-ash leading-relaxed">{u.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
