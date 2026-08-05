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
    slug: "gold-coast",
    city: "Gold Coast",
    state: "Queensland",
    stateAbbr: "QLD",
    meta: "Gym fitouts on the Gold Coast by MasterKraft. Complete boutique and commercial gym fit-outs designed, supplied and installed from Southport to Coolangatta.",
    intro: [
      "The Gold Coast runs one of the densest fitness scenes in the country, and MasterKraft delivers complete gym fit-outs right across it, from Southport and Surfers Paradise down to Burleigh and Coolangatta.",
      "Boutique studios, PT studios and full commercial floors, all designed, supplied and installed as one coordinated project, finished in your brand and built to hold up to constant, year-round use.",
    ],
    delivery:
      "Your whole fit-out ships to the Gold Coast as a single coordinated container and is installed on schedule, so nothing holds up your opening.",
    faqs: [
      {
        q: "Do you fit out gyms on the Gold Coast?",
        a: "Yes. We design, supply and install complete fit-outs across the Gold Coast, from Southport to Coolangatta.",
      },
      {
        q: "Do you work with boutique and PT studios?",
        a: "We do. The Gold Coast's boutique and PT studio scene is a big part of our work, alongside full commercial floors.",
      },
      {
        q: "Can you match our studio branding?",
        a: "Yes. Our in-house team produces custom-branded equipment and flooring, so the floor is finished in your identity rather than a generic spec.",
      },
    ],
  },
  {
    slug: "sunshine-coast",
    city: "Sunshine Coast",
    state: "Queensland",
    stateAbbr: "QLD",
    meta: "Gym fitouts on the Sunshine Coast by MasterKraft. Complete gym fit-outs designed, supplied and installed from Caloundra to Noosa.",
    intro: [
      "The Sunshine Coast is one of the fastest-growing regions in Queensland, and new studios and gyms are opening to match. MasterKraft delivers complete fit-outs across the region, from Caloundra and Maroochydore up to Noosa.",
      "From a single boutique studio to a full commercial floor, we design, supply and install the whole project, coordinated to your brand and built to last.",
    ],
    delivery:
      "One coordinated container, delivered and installed across the Sunshine Coast on schedule, with one team accountable from design to handover.",
    faqs: [
      {
        q: "Do you deliver to the Sunshine Coast?",
        a: "Yes. We design, supply and install complete fit-outs across the Sunshine Coast, from Caloundra to Noosa.",
      },
      {
        q: "Is the range the same as the capital cities?",
        a: "Exactly the same range, spec and custom branding, delivered as one complete fit-out.",
      },
      {
        q: "Do you handle design and layout too?",
        a: "Yes. We can take a project from floor-plan and layout through to supply, delivery and installation.",
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
  {
    slug: "canberra",
    city: "Canberra",
    state: "the ACT",
    stateAbbr: "ACT",
    meta: "Gym fitouts in Canberra by MasterKraft. Complete commercial and performance gym fit-outs designed, supplied and installed across the ACT.",
    intro: [
      "MasterKraft designs, supplies and installs complete gym fit-outs across Canberra and the ACT, from boutique and PT studios to full performance floors.",
      "The capital has a strong performance and functional-training culture, and we build for it: rigs, strength, conditioning and flooring, coordinated to your brand and specified to take heavy, daily use.",
    ],
    delivery:
      "Your whole floor ships to Canberra as a single coordinated container and is installed on schedule.",
    faqs: [
      { q: "Do you fit out gyms in Canberra?", a: "Yes. We design, supply and install complete fit-outs across Canberra and the ACT." },
      { q: "Do you build performance and functional gyms?", a: "We do. Rigs, platforms, strength and conditioning are core to what we deliver." },
      { q: "Do you supply only, or install as well?", a: "Both, from supply-only through to a full turnkey fit-out." },
    ],
  },
  {
    slug: "newcastle",
    city: "Newcastle",
    state: "New South Wales",
    stateAbbr: "NSW",
    meta: "Gym fitouts in Newcastle by MasterKraft. Complete gym fit-outs designed, supplied and installed across Newcastle and the Hunter.",
    intro: [
      "MasterKraft delivers complete gym fit-outs across Newcastle and the Hunter, designed, supplied and installed as one coordinated project.",
      "Newcastle's boutique and functional-training scene is growing fast. We deliver full floors built to hold up to constant use, coordinated to your brand from day one.",
    ],
    delivery:
      "One coordinated container, delivered and installed across Newcastle and the Hunter on schedule.",
    faqs: [
      { q: "Do you fit out gyms in Newcastle?", a: "Yes, across Newcastle and the wider Hunter region." },
      { q: "Do you cover the Hunter Valley?", a: "We do. The single-container model reaches right across the Hunter." },
      { q: "Can you brand the equipment?", a: "Yes, custom-branded to your studio's identity." },
    ],
  },
  {
    slug: "wollongong",
    city: "Wollongong",
    state: "New South Wales",
    stateAbbr: "NSW",
    meta: "Gym fitouts in Wollongong by MasterKraft. Complete gym fit-outs designed, supplied and installed across Wollongong and the Illawarra.",
    intro: [
      "MasterKraft designs, supplies and installs complete gym fit-outs across Wollongong and the Illawarra.",
      "From coastal boutique studios to full commercial floors, we deliver the whole project, coordinated to your brand and built to last through constant, daily training.",
    ],
    delivery:
      "Your fit-out ships to Wollongong as a single coordinated container and is installed on schedule.",
    faqs: [
      { q: "Do you deliver to Wollongong?", a: "Yes, across Wollongong and the Illawarra." },
      { q: "Do you fit out boutique studios?", a: "We do, alongside full commercial floors." },
      { q: "Do you design as well as supply?", a: "Yes, from layout through to install." },
    ],
  },
  {
    slug: "geelong",
    city: "Geelong",
    state: "Victoria",
    stateAbbr: "VIC",
    meta: "Gym fitouts in Geelong by MasterKraft. Complete gym fit-outs designed, supplied and installed across Geelong and the Surf Coast.",
    intro: [
      "MasterKraft delivers complete gym fit-outs across Geelong and the Surf Coast, designed, supplied and installed as one coordinated project.",
      "Victoria's second city is growing quickly, and its gyms with it. We deliver full floors, from boutique studios to commercial facilities, coordinated to your brand and built for heavy use.",
    ],
    delivery:
      "One coordinated container, delivered and installed across Geelong and the Surf Coast on schedule. As a Victorian team, we are close by.",
    faqs: [
      { q: "Do you fit out gyms in Geelong?", a: "Yes. As a Victorian team we deliver and install complete fit-outs across Geelong and the Surf Coast." },
      { q: "Do you cover the Surf Coast and Bellarine?", a: "We do, right across the region." },
      { q: "Supply only, or install too?", a: "Both, up to a full turnkey fit-out." },
    ],
  },
  {
    slug: "hobart",
    city: "Hobart",
    state: "Tasmania",
    stateAbbr: "TAS",
    meta: "Gym fitouts in Hobart by MasterKraft. Complete gym fit-outs delivered and installed across Tasmania, shipped as a single coordinated container.",
    intro: [
      "MasterKraft delivers complete gym fit-outs to Hobart and across Tasmania.",
      "Freight across Bass Strait is the usual sticking point for a Tasmanian fit-out. We solve it the same way we deliver internationally: your entire floor is specified once and shipped as a single coordinated container, so a Hobart build runs as smoothly as a mainland one.",
    ],
    delivery:
      "One container across Bass Strait, one delivery, one install, coordinated end to end.",
    faqs: [
      { q: "Can you fit out a gym in Hobart?", a: "Yes, in Hobart and across Tasmania." },
      { q: "How do you handle freight to Tasmania?", a: "Your whole floor is specified once and shipped as a single coordinated container across Bass Strait." },
      { q: "Is the range the same in Tasmania?", a: "Exactly the same range, spec and custom branding." },
    ],
  },
  {
    slug: "darwin",
    city: "Darwin",
    state: "the Northern Territory",
    stateAbbr: "NT",
    meta: "Gym fitouts in Darwin by MasterKraft. Complete gym fit-outs delivered and installed across the Northern Territory, shipped as a single coordinated container.",
    intro: [
      "MasterKraft delivers complete gym fit-outs to Darwin and across the Northern Territory.",
      "Distance is the challenge in the Top End, and it is exactly what our single-container model is built for. Your whole floor is specified once and delivered complete, so you get the full spec and quality without managing freight from the other side of the country.",
    ],
    delivery:
      "One container, delivered and installed in Darwin on schedule, coordinated from our end.",
    faqs: [
      { q: "Can you deliver a gym fit-out to Darwin?", a: "Yes, to Darwin and across the Northern Territory." },
      { q: "How does delivery to the NT work?", a: "Everything ships as one coordinated container, so there is no piecing together freight interstate." },
      { q: "Same range as the capital cities?", a: "Identical range, spec and custom branding." },
    ],
  },
  {
    slug: "central-coast",
    city: "Central Coast",
    state: "New South Wales",
    stateAbbr: "NSW",
    meta: "Gym fitouts on the Central Coast by MasterKraft. Complete gym fit-outs designed, supplied and installed from Gosford to Wyong.",
    intro: [
      "MasterKraft designs, supplies and installs complete gym fit-outs across the NSW Central Coast, from Gosford and Wyong through the surrounding region.",
      "The Central Coast is one of the state's fastest-growing corridors, and new studios and gyms are opening across it. We deliver full floors, coordinated to your brand and built to last.",
    ],
    delivery:
      "Your fit-out ships to the Central Coast as a single coordinated container and is installed on schedule.",
    faqs: [
      { q: "Do you deliver to the Central Coast?", a: "Yes, from Gosford to Wyong and across the region." },
      { q: "Do you work with new studio openings?", a: "We do. A lot of our Central Coast work is new studios opening their doors." },
      { q: "Do you handle design and install?", a: "Yes, from layout through to a full turnkey fit-out." },
    ],
  },
];

export function getLocation(slug: string) {
  return locations.find((l) => l.slug === slug);
}
