import JsonLd from "@/components/seo/JsonLd";
import { SITE_URL } from "@/lib/site";

// STRUCTURED DATA FOR THE PAGES THAT HAD NONE.
//
// Twenty top-level pages (our-story, fitout, all-equipment, the support and
// legal pages, indie-iron …) emitted no JSON-LD at all; the 10 Nov Rankability
// site audit flagged them. Product, category, city and fit-out-type pages
// already describe themselves, and PageHero adds a BreadcrumbList when it is
// given crumbs, which these pages are not, because crumbs there are visible.
//
// This is the invisible half: what the page is, where it sits under the site,
// and who publishes it. No markup changes on the page. `type` narrows the
// generic WebPage where schema.org has a better word (AboutPage,
// CollectionPage); `mainEntity` says what the page is about when that is a
// thing in its own right, like the fit-out service.

type Props = {
  /** The page's path, as its canonical: "/our-story". */
  path: string;
  /** Human name of the page, the last breadcrumb. */
  name: string;
  /** Usually the page's `metadata.description`, which Next types as nullable. */
  description?: string | null;
  type?: "WebPage" | "AboutPage" | "CollectionPage" | "ContactPage";
  mainEntity?: Record<string, unknown>;
};

export const PUBLISHER = { "@type": "Organization", name: "MasterKraft", url: SITE_URL } as const;

export default function PageSchema({ path, name, description, type = "WebPage", mainEntity }: Props) {
  const url = `${SITE_URL}${path}`;
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": type,
        "@id": `${url}#webpage`,
        url,
        name,
        ...(description ? { description } : {}),
        inLanguage: "en-AU",
        isPartOf: { "@type": "WebSite", url: SITE_URL, name: "MASTERKRAFT" },
        publisher: PUBLISHER,
        breadcrumb: {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            { "@type": "ListItem", position: 2, name, item: url },
          ],
        },
        ...(mainEntity ? { mainEntity } : {}),
      }}
    />
  );
}
