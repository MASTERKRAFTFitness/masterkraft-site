export type RevlSite = {
  slug: string;
  name: string;
  location: string;
  blurb: string;
  image: string;
  body: string[];
  // Up to 6 photos for the club page gallery. Computed at module load from the
  // hero + any location-specific shots + the shared REVL training pool.
  gallery: string[];
};

// Raw site data authored below; `extras` are location-specific photos (e.g. the
// Singapore studios) that should appear ahead of the generic pool in a gallery.
type RawRevlSite = Omit<RevlSite, "gallery"> & { extras?: string[] };

const rawSites: RawRevlSite[] = [
  {
    slug: "revl-brighton",
    name: "REVL Brighton",
    location: "Brighton, SA",
    blurb: "A full boutique fit-out for REVL's Brighton studio in South Australia.",
    image: "/revl/gallery/shot-4.jpg",
    body: [
      "REVL Brighton required a complete performance-training environment built for high-intensity group classes running back to back, all day.",
      "MasterKraft supplied and installed the full floor - rigs, functional zones, conditioning equipment, storage and flooring - coordinated to REVL's brand and programming. A durable, cohesive studio that holds up to constant use while delivering the energy REVL members expect.",
    ],
  },
  {
    slug: "revl-bondi",
    name: "REVL Bondi",
    location: "Bondi, NSW",
    blurb: "REVL's Bondi studio, delivered complete by MasterKraft.",
    image: "/revl/gallery/shot-1.jpg",
    body: [
      "MasterKraft fitted out REVL Bondi to the same repeatable spec REVL runs across its network - rigs, conditioning gear, storage and flooring, ready for back-to-back classes.",
      "One spec sheet, one accountable partner, and a floor built to perform from day one.",
    ],
  },
  {
    slug: "revl-burleigh",
    name: "REVL Burleigh",
    location: "Burleigh, QLD",
    blurb: "A complete REVL fit-out on Queensland's Gold Coast.",
    image: "/revl/gallery/shot-3.png",
    body: [
      "REVL Burleigh brought the REVL experience to the Gold Coast. MasterKraft delivered the full floor to REVL's exact specification, installed and ready to train.",
      "Consistent equipment, consistent branding, consistent quality - the same REVL members know at every location.",
    ],
  },
  {
    slug: "revl-collingwood",
    name: "REVL Collingwood",
    location: "Collingwood, VIC",
    blurb: "REVL's Melbourne studio, fitted out end-to-end.",
    image: "/revl/gallery/skierg.jpg",
    body: [
      "MasterKraft supplied and installed REVL Collingwood's full performance floor, coordinated to REVL's programming and brand.",
      "A hard-wearing, cohesive studio delivered on schedule and built to take a beating.",
    ],
  },
  {
    slug: "revl-campbelltown-aus",
    name: "REVL Campbelltown",
    location: "Campbelltown, NSW",
    blurb: "Another premium REVL studio delivered end-to-end by MasterKraft.",
    image: "/revl/gallery/shot-2.png",
    body: [
      "As REVL expanded, Campbelltown needed the same identical, repeatable fit-out delivered to a new footprint on schedule.",
      "MasterKraft specified the equipment once and delivered it identically - the same spec sheet, the same quality, the same branding - so members get a consistent REVL experience across locations.",
    ],
  },
  {
    slug: "revl-singapore",
    name: "REVL City Hall",
    location: "Singapore",
    blurb: "The REVL fit-out delivered beyond Australia, into the Asia-Pacific.",
    image: "/revl/gallery/cityhall.jpg",
    extras: ["/revl/singapore.jpg", "/revl/singapore-2.jpg", "/revl/gallery/raffles-place.jpg"],
    body: [
      "REVL City Hall took the REVL model into Singapore. MasterKraft delivered the full studio fit-out, shipped complete in a single coordinated container.",
      "Same spec sheet, same quality, the same branding REVL runs across its network - one accountable partner and a floor built to perform from day one, delivered internationally.",
    ],
  },
  {
    slug: "revl-lower-pierce",
    name: "REVL Lower Pierce",
    location: "Singapore",
    blurb: "A second Singapore studio, delivered to the same REVL spec.",
    image: "/revl/gallery/lower-pierce.jpg",
    extras: ["/revl/singapore-2.jpg", "/revl/gallery/raffles-place.jpg", "/revl/singapore.jpg"],
    body: [
      "MasterKraft fitted out REVL Lower Pierce to the identical specification REVL runs worldwide, delivered complete and installation-ready.",
      "Repeatable quality across borders - the same REVL floor, wherever members train.",
    ],
  },
  {
    slug: "revl-kuala-lumpur",
    name: "REVL Kuala Lumpur",
    location: "Kuala Lumpur, Malaysia",
    blurb: "REVL's Malaysian flagship, fitted out by MasterKraft.",
    image: "/revl/gallery/rowers-bw.jpg",
    body: [
      "MasterKraft supplied and delivered REVL's Kuala Lumpur studio to the same global spec, shipped complete and installed to REVL's brand standard.",
      "One partner, one point of contact, and a performance floor ready from day one.",
    ],
  },
  {
    slug: "revl-ho-chi-minh-city",
    name: "REVL Ho Chi Minh City",
    location: "Ho Chi Minh City, Vietnam",
    blurb: "REVL's Vietnam studio, delivered complete from Australia.",
    image: "/revl/gallery/raffles-place.jpg",
    body: [
      "MasterKraft delivered REVL's Ho Chi Minh City floor to the exact REVL specification, shipped and installed as a complete, coordinated fit-out.",
      "The same equipment, branding and quality REVL members expect, delivered across the region.",
    ],
  },
  {
    slug: "revl-taipei",
    name: "REVL Taipei",
    location: "Taipei, Taiwan",
    blurb: "REVL's eighth market, fitted out by MasterKraft.",
    image: "/revl/gallery/shot-6.jpg",
    body: [
      "REVL Taipei marked REVL's eighth market. MasterKraft delivered the full studio fit-out to REVL's global specification, complete and ready to train.",
      "One accountable partner behind every REVL floor, worldwide.",
    ],
  },
];

// Shared REVL training/studio photography (used under MasterKraft's collateral
// agreement with REVL). These generic shots fill out each club gallery after the
// hero and any location-specific extras.
const GENERIC_SHOTS: string[] = [
  "/revl/full-studio.jpg",
  "/revl/wide-studio.jpg",
  "/revl/rigs.jpg",
  "/revl/branded-bikes.jpg",
  "/revl/branded-wall.jpg",
  "/revl/people.jpg",
  "/revl/gallery/shot-1.jpg",
  "/revl/gallery/shot-4.jpg",
  "/revl/gallery/shot-6.jpg",
  "/revl/gallery/skierg.jpg",
  "/revl/gallery/rowers-bw.jpg",
  "/revl/gallery/shot-2.png",
  "/revl/gallery/shot-3.png",
];

// Build a de-duplicated gallery of up to 6 images: hero first, then any
// location-specific extras, then the generic pool rotated by `index` so adjacent
// club pages don't show an identical run of photos.
function buildGallery(hero: string, extras: string[], index: number): string[] {
  const offset = index % GENERIC_SHOTS.length;
  const rotated = [...GENERIC_SHOTS.slice(offset), ...GENERIC_SHOTS.slice(0, offset)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const src of [hero, ...extras, ...rotated]) {
    if (seen.has(src)) continue;
    seen.add(src);
    out.push(src);
    if (out.length === 6) break;
  }
  return out;
}

export const revlSites: RevlSite[] = rawSites.map((s, i) => {
  const { extras, ...rest } = s;
  return { ...rest, gallery: buildGallery(s.image, extras ?? [], i) };
});

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
