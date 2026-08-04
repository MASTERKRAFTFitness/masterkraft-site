export type RevlSite = {
  slug: string;
  name: string;
  location: string;
  blurb: string;
  image: string;
  body: string[];
};

export const revlSites: RevlSite[] = [
  {
    slug: "revl-brighton",
    name: "REVL Brighton",
    location: "Brighton, VIC",
    blurb: "A full boutique fit-out for one of REVL's flagship performance studios.",
    image: "/revl/rigs.jpg",
    body: [
      "REVL Brighton required a complete performance-training environment built for high-intensity group classes running back to back, all day.",
      "MasterKraft supplied and installed the full floor - rigs, functional zones, conditioning equipment, storage and flooring - coordinated to REVL's brand and programming.",
      "The result is a durable, cohesive studio that holds up to constant use while delivering the energy REVL members expect.",
    ],
  },
  {
    slug: "revl-campbelltown-aus",
    name: "REVL Campbelltown",
    location: "Campbelltown, NSW",
    blurb: "Another premium REVL studio delivered end-to-end by MasterKraft.",
    image: "/revl/branded-bikes.jpg",
    body: [
      "As REVL expanded, Campbelltown needed the same identical, repeatable fit-out delivered to a new footprint on schedule.",
      "MasterKraft specified the equipment once and delivered it identically - the same spec sheet, the same quality, the same branding - so members get a consistent REVL experience across locations.",
      "One partner, one point of contact, and a floor built to perform from day one.",
    ],
  },
];

export function getRevlSite(slug: string) {
  return revlSites.find((s) => s.slug === slug);
}
