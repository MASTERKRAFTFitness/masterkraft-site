import PageHero from "@/components/marketing/PageHero";

export type ContentSection = { heading?: string; body: string[] };
export type ContentPageData = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  intro?: string;
  sections: ContentSection[];
};

export default function ContentPage({ eyebrow, title, subtitle, intro, sections }: ContentPageData) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <section className="container-mk max-w-3xl py-16">
        {intro && <p className="text-xl text-ink leading-relaxed mb-10">{intro}</p>}
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
      </section>
    </>
  );
}
