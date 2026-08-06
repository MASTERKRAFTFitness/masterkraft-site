// Scrolling "ENGINEERED FOR FITNESS" band used between homepage sections.
export default function Marquee({
  dark = false,
}: {
  dark?: boolean;
}) {
  const items = Array.from({ length: 8 });
  return (
    <div
      className={`overflow-hidden py-4 border-y ${
        dark ? "bg-carbon border-white/10" : "bg-smoke border-line"
      }`}
    >
      <div className="mk-marquee-track">
        {/* duplicated content for a seamless loop */}
        {[0, 1].map((set) => (
          <div key={set} className="flex shrink-0" aria-hidden={set === 1}>
            {items.map((_, i) => (
              <span
                key={i}
                className={`font-display uppercase tracking-[0.25em] text-sm font-semibold px-8 flex items-center gap-8 ${
                  dark ? "text-white/70" : "text-ink/70"
                }`}
              >
                Engineered for Fitness
                <span className="text-accent" aria-hidden="true">◆</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
