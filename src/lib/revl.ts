export type RevlSite = {
  slug: string;
  name: string;
  location: string;
  blurb: string;
  image: string;
  body: string[];
  // Up to 6 real photos of this specific studio, sourced from the club's own
  // Instagram (used with REVL's permission). Empty for studios without an
  // account yet (e.g. Taipei) — the gallery section is hidden in that case.
  gallery: string[];
  // The studio's own Instagram handle (no @), if it has an account.
  instagram?: string;
};

type RawRevlSite = Omit<RevlSite, "gallery">;

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
    location: "Campbelltown, SA",
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

// Real per-studio photos pulled from each club's own Instagram (with REVL's
// permission), stored under /public/revl/ig/<slug>/NN.jpg. The number is how
// many good studio/training/community shots that account yielded; studios with
// no account yet (Taipei) are omitted and simply show no gallery.
const igPhotos = (slug: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `/revl/ig/${slug}/${String(i + 1).padStart(2, "0")}.jpg`);

const IG_PHOTOS: Record<string, string[]> = {
  "revl-brighton": igPhotos("revl-brighton", 4),
  "revl-bondi": igPhotos("revl-bondi", 5),
  "revl-burleigh": igPhotos("revl-burleigh", 5),
  "revl-collingwood": igPhotos("revl-collingwood", 5),
  "revl-campbelltown": igPhotos("revl-campbelltown", 5),
  "revl-singapore": igPhotos("revl-singapore", 4),
  "revl-lower-pierce": igPhotos("revl-lower-pierce", 5),
  "revl-kuala-lumpur": igPhotos("revl-kuala-lumpur", 4),
  "revl-ho-chi-minh-city": igPhotos("revl-ho-chi-minh-city", 4),
};

// Each studio's own Instagram handle (naming is inconsistent across the network).
const IG_HANDLES: Record<string, string> = {
  "revl-brighton": "revl.training.brighton.sa",
  "revl-bondi": "revltraining.bondi",
  "revl-burleigh": "revltraining.burleigh",
  "revl-collingwood": "revl.training.collingwood",
  "revl-campbelltown": "revl.training.campbelltown",
  "revl-singapore": "revl.training.cityhall",
  "revl-lower-pierce": "revl.training.lowerpeirce",
  "revl-kuala-lumpur": "revl.training.klcc",
  "revl-ho-chi-minh-city": "revl.training.thaodien",
};

export const revlSites: RevlSite[] = rawSites.map((s) => ({
  ...s,
  gallery: IG_PHOTOS[s.slug] ?? [],
  instagram: IG_HANDLES[s.slug],
}));

export function getRevlSite(slug: string) {
  return revlSites.find((s) => s.slug === slug);
}

export type RevlMarket = { country: string; flag: string; studios: string[]; comingSoon?: boolean };

// Every REVL club in Australia, with the suburb it actually trades in and the
// /gym-fitouts/[city] page it belongs to. Verified against REVL's own locations
// directory (revltraining.com.au) - several clubs are named for one suburb but
// sit in another (Brighton is in Hove, Mile End in Torrensville, St Marys in
// Melrose Park), and Brighton + Campbelltown are BOTH South Australian, not the
// Victorian / NSW suburbs of the same name.
export type RevlClub = {
  name: string;
  suburb: string;
  state: "NSW" | "QLD" | "SA" | "VIC";
  // Slug of the city/region fit-out page this club sits in. Omitted for clubs
  // outside any city page's catchment (e.g. Albury, Mount Gambier).
  region?: string;
  // Regional rather than metro - listed separately on the city page.
  regional?: boolean;
};

export const revlClubsAu: RevlClub[] = [
  // New South Wales
  { name: "Albury", suburb: "Thurgoona", state: "NSW", region: "sydney", regional: true },
  { name: "Bondi", suburb: "Bondi Beach", state: "NSW", region: "sydney" },
  { name: "Brookvale", suburb: "Brookvale", state: "NSW", region: "sydney" },
  { name: "Neutral Bay", suburb: "Neutral Bay", state: "NSW", region: "sydney" },
  { name: "Erina", suburb: "Erina", state: "NSW", region: "central-coast" },
  { name: "Kincumber", suburb: "Kincumber", state: "NSW", region: "central-coast" },
  // Queensland
  { name: "Greenslopes", suburb: "Greenslopes", state: "QLD", region: "brisbane" },
  { name: "Loganholme", suburb: "Loganholme", state: "QLD", region: "brisbane" },
  { name: "Burleigh", suburb: "Burleigh Heads", state: "QLD", region: "gold-coast" },
  { name: "Caloundra", suburb: "Caloundra", state: "QLD", region: "sunshine-coast" },
  { name: "Maroochydore", suburb: "Maroochydore", state: "QLD", region: "sunshine-coast" },
  { name: "Sippy Downs", suburb: "Sippy Downs", state: "QLD", region: "sunshine-coast" },
  // South Australia
  { name: "Brighton", suburb: "Hove", state: "SA", region: "adelaide" },
  { name: "Campbelltown", suburb: "Campbelltown", state: "SA", region: "adelaide" },
  { name: "Mile End", suburb: "Torrensville", state: "SA", region: "adelaide" },
  { name: "Norwood", suburb: "Norwood", state: "SA", region: "adelaide" },
  { name: "Plympton", suburb: "North Plympton", state: "SA", region: "adelaide" },
  { name: "Prospect", suburb: "Prospect", state: "SA", region: "adelaide" },
  { name: "St Marys", suburb: "Melrose Park", state: "SA", region: "adelaide" },
  { name: "Unley", suburb: "Parkside", state: "SA", region: "adelaide" },
  { name: "Mount Barker", suburb: "Aston Hills", state: "SA", region: "adelaide", regional: true },
  { name: "Mount Gambier", suburb: "Mount Gambier", state: "SA", region: "adelaide", regional: true },
  // Victoria
  { name: "Collingwood", suburb: "Collingwood", state: "VIC", region: "melbourne" },
  { name: "Frankston", suburb: "Frankston", state: "VIC", region: "melbourne" },
  { name: "Mordialloc", suburb: "Mordialloc", state: "VIC", region: "melbourne" },
  { name: "Port Melbourne", suburb: "Port Melbourne", state: "VIC", region: "melbourne" },
  { name: "Prahran", suburb: "Prahran", state: "VIC", region: "melbourne" },
];

// The REVL clubs shown on a given /gym-fitouts/[city] page.
export function revlClubsForRegion(slug: string): RevlClub[] {
  return revlClubsAu.filter((c) => c.region === slug);
}

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
    // Derived from revlClubsAu so the network list and the per-city lists can
    // never drift apart.
    studios: revlClubsAu.map((c) => c.name).sort((a, b) => a.localeCompare(b)),
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
