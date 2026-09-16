import PageHero from "@/components/marketing/PageHero";
import AccordionSections from "@/components/marketing/AccordionSections";

export type ContentSection = { heading?: string; body: string[] };
export type ContentPageData = {
  eyebrow: string;
  title: string;
  /**
   * The `<title>`, where the H1 is too short to be one on its own.
   *
   * These pages set `metadata.title` from `title`, and `title` is an H1 sitting
   * under an eyebrow that already says "Support" or "Legal" — so it is one or
   * two words, and "Returns | MASTERKRAFT" is what went to Google. Eight of
   * these pages were flagged as having too short a title in the Opinly site
   * audit on 2026-09-16.
   *
   * Only the route's metadata reads this; the page still renders `title`.
   * Unset means the H1 is already carrying its own weight.
   */
  seoTitle?: string;
  subtitle?: string;
  intro?: string;
  sections: ContentSection[];
  // When true, sections render as an expand/collapse accordion (concertina).
  collapsible?: boolean;
};

export default function ContentPage({ eyebrow, title, subtitle, intro, sections, collapsible }: ContentPageData) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <section className="container-mk max-w-3xl py-16">
        {intro && <p className="text-xl text-ink leading-relaxed mb-10">{intro}</p>}
        {collapsible && sections.every((s) => s.heading) ? (
          <AccordionSections sections={sections} />
        ) : (
        <div className="space-y-10">
          {sections.map((s, i) => (
            <div key={i}>
              {s.heading && <h2 className="text-xl font-bold mb-3">{s.heading}</h2>}
              <div className="space-y-4">
                {s.body.map((p, j) => (
                  <p key={j} className="text-ash leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
        )}
      </section>
    </>
  );
}
