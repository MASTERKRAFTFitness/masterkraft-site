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
  {
    slug: "revl-singapore",
    name: "REVL Singapore",
    location: "Singapore",
    blurb: "The REVL fit-out delivered beyond Australia, into the Asia-Pacific.",
    image: "/revl/singapore.jpg",
    body: [
      "REVL Singapore took the REVL model beyond Australia. MasterKraft delivered the full studio fit-out to Singapore, shipped complete in a single coordinated container.",
      "Same spec sheet, same quality, the same branding REVL runs across its network, so members get a consistent REVL experience whether they train in Australia or Singapore.",
      "One accountable partner, one delivery and a floor built to perform from day one, delivered internationally.",
    ],
  },
];

export function getRevlSite(slug: string) {
  return revlSites.find((s) => s.slug === slug);
}

export type RevlMarket = { country: string; flag: string; studios: string[]; comingSoon?: boolean };

// REVL studio + training photography (used under MasterKraft's collateral
// agreement with REVL). Sourced from REVL's own marketing imagery.
export const revlGallery: { src: string; alt: string }[] = [
  { src: "/revl/gallery/shot-6.jpg", alt: "Inside a REVL Training studio fitted out by MasterKraft" },
  { src: "/revl/gallery/shot-1.jpg", alt: "Athlete training on an air bike at REVL Training" },
  { src: "/revl/gallery/shot-4.jpg", alt: "REVL Training studio floor with rigs, bikes and rowers" },
  { src: "/revl/gallery/shot-2.png", alt: "Deadlift session at a REVL Training studio" },
  { src: "/revl/gallery/shot-3.png", alt: "Conditioning workout at REVL Training" },
];

// The full REVL Training network MasterKraft has fitted out, grouped by market.
// Named studios sourced from REVL's regional websites (2026); markets without
// individually named studios are shown as operating. Dubai is excluded per the
// client. Keep this list current as REVL opens new studios.
export const revlNetwork: RevlMarket[] = [
  {
    country: "Australia",
    flag: "🇦🇺",
    studios: [
      "Albury", "Bondi", "Brighton", "Brookvale", "Burleigh", "Caloundra",
      "Campbelltown", "Collingwood", "Erina", "Frankston", "Greenslopes",
      "Kincumber", "Loganholme", "Maroochydore", "Mile End", "Mordialloc",
      "Mount Barker", "Mount Gambier", "Neutral Bay", "Norwood", "Plympton",
      "Port Melbourne", "Prahran", "Prospect", "Sippy Downs", "St Marys", "Unley",
    ],
  },
  {
    country: "Singapore",
    flag: "🇸🇬",
    studios: [
      "Balestier", "Bukit Timah", "City Hall", "Harbourfront", "Katong",
      "Lower Pierce", "Potong Pasir", "Punggol", "Raffles Place", "River Valley",
      "Rochester", "Seletar", "Serangoon", "Tampines", "Thomson", "Tiong Bahru",
      "Yishun",
    ],
  },
  { country: "Malaysia", flag: "🇲🇾", studios: ["Kuala Lumpur (KLCC)"] },
  { country: "Vietnam", flag: "🇻🇳", studios: ["Ho Chi Minh City"] },
  { country: "Taiwan", flag: "🇹🇼", studios: ["Taipei"] },
  { country: "South Korea", flag: "🇰🇷", studios: [], comingSoon: true },
  { country: "Canada", flag: "🇨🇦", studios: [], comingSoon: true },
  { country: "Indonesia", flag: "🇮🇩", studios: [], comingSoon: true },
  { country: "United States", flag: "🇺🇸", studios: [], comingSoon: true },
];
