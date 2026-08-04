// Long-form content wrapper for text-heavy pages (legal, info, story).
export default function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="
        container-mk max-w-3xl py-16
        [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-12 [&_h2]:mb-4
        [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-8 [&_h3]:mb-3
        [&_p]:text-ash [&_p]:leading-relaxed [&_p]:mb-4
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ul]:text-ash [&_ul]:space-y-1.5
        [&_a]:text-ink [&_a]:underline [&_a]:decoration-accent-600 [&_a]:underline-offset-2
        [&_strong]:text-ink
      "
    >
      {children}
    </div>
  );
}
