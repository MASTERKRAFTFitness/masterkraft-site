// Small uppercase label with a accent "pop" marker - the brand accent that
// stays legible on both light and dark backgrounds.
export default function Eyebrow({
  children,
  tone = "light",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <p
      className={`inline-flex items-center gap-2.5 font-display uppercase tracking-[0.3em] text-xs font-semibold ${
        tone === "dark" ? "text-accent" : "text-ink"
      } ${className}`}
    >
      <span className="h-2.5 w-2.5 bg-accent shrink-0" aria-hidden />
      {children}
    </p>
  );
}
