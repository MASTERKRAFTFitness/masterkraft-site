// City landing pages for the fit-out service (/gym-fitouts/[city]).
// Each city carries genuinely distinct copy + FAQs (and a real local project
// where one exists) so these read as real service pages, not thin doorway
// pages. Capability content is shared; the unique content leads.

export type LocationFaq = { q: string; a: string };

export type Location = {
  slug: string;
  city: string;
  state: string;
  stateAbbr: string;
  // Meta description for the page.
  meta: string;
  // 2-3 unique intro paragraphs.
  intro: string[];
  // City-specific delivery / logistics line.
  delivery: string;
  // Real, named local project (only where one genuinely exists).
  project?: { name: string; href: string; blurb: string };
  faqs: LocationFaq[];
};

export const locations: Location[] = [
  {
    slug: "melbourne",
    city: "Melbourne",
    state: "Victoria",
    stateAbbr: "VIC",
    meta: "Gym fitouts in Melbourne, designed, supplied and installed by MasterKraft. Complete commercial and boutique fit-outs across metro Melbourne and regional Victoria.",
    intro: [
      "Melbourne is MasterKraft's home ground. We design, supply and install complete gym fit-outs right across the metro area and regional Victoria, from boutique studios in the inner suburbs to full commercial floors.",
      "It is where a lot of our work lives. We delivered the entire fit-out for REVL's Brighton studio and we produce the custom-branded equipment used across Fernwood's Victorian clubs. If you are building or refitting a gym in Melbourne, you are working with a local team, not a distant supplier.",
    ],
    delivery:
      "Fast delivery and installation across Melbourne and regional Victoria, with your whole floor arriving coordinated and on schedule.",
    project: {
      name: "REVL Brighton",
      href: "/revl-fitouts/revl-brighton",
      blurb: "A full boutique performance fit-out delivered floor to ceiling in Brighton.",
    },
    faqs: [
      {
        q: "Do you install gyms in Melbourne?",
        a: "Yes. We design, supply and install complete fit-outs across metropolitan Melbourne and regional Victoria, coordinated end to end by our own team.",
      },
      {
        q: "Can I see a MasterKraft fit-out near me?",
        a: "REVL Brighton is one of our Melbourne fit-outs, delivered floor to ceiling. We also produce the custom-branded equipment used across Fernwood's Victorian clubs.",
      },
      {
        q: "How quickly can you fit out a Melbourne gym?",
        a: "Because we ship each project as a single coordinated container, most Melbourne fit-outs move from sign-off to installed floor in weeks, not months.",
      },
    ],
  },
  {
    slug: "sydney",
    city: "Sydney",
    state: "New South Wales",
    stateAbbr: "NSW",
    meta: "Gym fitouts in Sydney by MasterKraft. Complete commercial and boutique fit-outs designed, supplied and installed across Sydney and New South Wales.",
    intro: [
      "MasterKraft delivers complete gym fit-outs across Sydney and New South Wales, designed, supplied and installed as one coordinated project.",
      "We know the NSW market. We delivered REVL's Campbelltown studio end to end, matching the exact spec and branding REVL runs interstate. Whether it is a boutique studio in the Inner West or a commercial floor in Western Sydney, you get one accountable partner from design to handover.",
    ],
    delivery:
      "Your entire fit-out ships to Sydney in a single container and is installed by one coordinated crew, so there is no juggling separate suppliers across the build.",
    project: {
      name: "REVL Campbelltown",
      href: "/revl-fitouts/revl-campbelltown-aus",
      blurb: "A premium REVL studio delivered end to end in Sydney's south west.",
    },
    faqs: [
      {
        q: "Do you fit out gyms in Sydney?",
        a: "Yes. We design, supply and install complete fit-outs across Sydney and New South Wales, from boutique studios to full commercial floors.",
      },
      {
        q: "Have you delivered Sydney projects?",
        a: "REVL Campbelltown was delivered by MasterKraft end to end, on the same spec sheet and branding REVL uses across its network.",
      },
      {
        q: "Do you deliver to regional NSW?",
        a: "Yes. The single-container model means we deliver and install complete fit-outs well beyond metro Sydney, right across New South Wales.",
      },
    ],
  },
  {
    slug: "brisbane",
    city: "Brisbane",
    state: "Queensland",
    stateAbbr: "QLD",
    meta: "Gym fitouts in Brisbane by MasterKraft. Complete gym fit-outs designed, supplied and installed across Brisbane, the Gold Coast and South East Queensland.",
    intro: [
      "MasterKraft designs, supplies and installs gym fit-outs across Brisbane, the Gold Coast and South East Queensland.",
      "South East Queensland is one of the fastest-growing fitness markets in the country. We deliver complete floors, rigs, strength, cardio, functional zones, storage and flooring, coordinated to your brand and built for Queensland's high-traffic clubs.",
    ],
    delivery:
      "Your whole fit-out arrives in Brisbane as a single coordinated container and is installed to schedule, so a long supply chain never holds up your opening.",
    faqs: [
      {
        q: "Do you deliver gym fit-outs to Brisbane?",
        a: "Yes. We design, supply and install complete fit-outs across Brisbane and South East Queensland, coordinated end to end.",
      },
      {
        q: "Do you cover the Gold Coast and regional QLD?",
        a: "We do. Because each project ships as one container, we deliver and install right across the Gold Coast, Sunshine Coast and regional Queensland.",
      },
      {
        q: "Do you supply equipment only, or install as well?",
        a: "Both. We can supply equipment on its own, or design, supply and install the entire floor as a turnkey fit-out.",
      },
    ],
  },
  {
    slug: "perth",
    city: "Perth",
    state: "Western Australia",
    stateAbbr: "WA",
    meta: "Gym fitouts in Perth by MasterKraft. Complete gym fit-outs delivered and installed across Perth and Western Australia, shipped as a single coordinated container.",
    intro: [
      "MasterKraft delivers complete gym fit-outs to Perth and right across Western Australia.",
      "Distance is the usual headache for a Perth fit-out. We solve it the same way we deliver across the Asia-Pacific: your entire floor is specified once and shipped as a single coordinated container. You get the full spec, the full quality and the full branding without managing freight from three states away.",
    ],
    delivery:
      "One container, one delivery, one install, coordinated from our end so a Perth build runs as smoothly as a metro one.",
    faqs: [
      {
        q: "Can you fit out a gym in Perth?",
        a: "Yes. We design, supply and install complete fit-outs in Perth and across Western Australia.",
      },
      {
        q: "How do you handle freight to WA?",
        a: "Your whole floor is specified once and shipped as a single coordinated container, so there is no piecing together freight from multiple suppliers interstate.",
      },
      {
        q: "Is the range the same in Perth as the eastern states?",
        a: "Exactly the same. Same spec, same quality, same custom branding, delivered to Perth as one complete fit-out.",
      },
    ],
  },
  {
    slug: "adelaide",
    city: "Adelaide",
    state: "South Australia",
    stateAbbr: "SA",
    meta: "Gym fitouts in Adelaide by MasterKraft. Complete boutique and commercial gym fit-outs designed, supplied and installed across Adelaide and South Australia.",
    intro: [
      "MasterKraft designs, supplies and installs gym fit-outs across Adelaide and South Australia.",
      "From boutique and PT studios to full commercial floors, we deliver complete, cohesive fit-outs to Adelaide, coordinated to your brand and built to hold up to constant use.",
    ],
    delivery:
      "Your whole floor ships to Adelaide as a single coordinated container and is installed on schedule, with one team accountable from design to handover.",
    faqs: [
      {
        q: "Do you deliver gym fit-outs to Adelaide?",
        a: "Yes. We design, supply and install complete fit-outs across Adelaide and South Australia.",
      },
      {
        q: "Do you fit out boutique and PT studios in Adelaide?",
        a: "We do. Boutique studios, PT studios and full commercial floors are all delivered as complete, coordinated fit-outs.",
      },
      {
        q: "Do you handle the design as well as supply?",
        a: "Yes. We can take a project from floor-plan and layout through to supply, delivery and installation.",
      },
    ],
  },
];

export function getLocation(slug: string) {
  return locations.find((l) => l.slug === slug);
}
