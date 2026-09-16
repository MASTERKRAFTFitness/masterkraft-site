// Alt text for the brand photography, KEYED BY THE FILE rather than by the page.
//
// WHY NOT ON THE PAGE. Every banner image on this site was `alt=""`, on the
// reasoning that a photograph sitting at 40% opacity behind an H1 is
// decorative. The Opinly site audit counted them on all 100 pages on
// 2026-09-16, and the audit is right: these are the only photographs of the
// work on most of these pages, and a gym fit-out business has a real stake in
// image search.
//
// WHY NOT DERIVED FROM THE PAGE EITHER — and this is the part worth knowing
// before "improving" it. The obvious fix is `alt={title}`, and it would be
// WRONG, because these photographs do not depict the page they sit on:
//
//   /category/strength.jpg    is a man deadlifting a 28 kg kettlebell
//   /category/flooring.jpg    is a dumbbell squat, lit blue and pink
//   /category/cardio.jpg      is a cable machine
//
// "Strength equipment" on the first of those is a description of the heading,
// not of the picture, and alt text that describes something other than the
// image is worse than none. So each file is described once, from the file, and
// the pages that share a photograph share its description — /category/
// body-weight.jpg and /fitout/home-gym.jpg are byte-identical, and Cardio,
// Rigs & Racks and Strength each double as a fit-out type banner.
//
// A path with no entry gets `alt=""`, which is what everything had before.
const HERO_ALT: Record<string, string> = {
  "/home/hero-1.jpg":
    "Lifter chalking up over a MasterKraft barbell loaded with 20 kg bumper plates",
  "/home/hero-2.jpg":
    "Box jump onto a MasterKraft plyo box beside a half rack, bumper plates and kettlebells",
  "/home/hero-3.jpg":
    "Athlete swinging a MasterKraft barbell with 15 kg bumper plates beside a loaded rack",
  "/home/distributor.jpg":
    "Dumbbell squat in a MasterKraft-fitted studio with kettlebells, battle ropes and plyo boxes",
  "/home/shop-equipment.jpg":
    "Back squat with a MasterKraft barbell, lit blue",
  "/home/fitouts.jpg":
    "Front rack hold on a MasterKraft barbell loaded with 15 kg bumper plates",

  "/category/strength.jpg":
    "Deadlift set-up over a 28 kg kettlebell, with a dumbbell rack and MasterKraft bumper plates behind",
  "/category/weightlifting.jpg":
    "Front rack position on a MasterKraft barbell loaded with 15 kg bumper plates",
  "/category/rigs-racks.jpg":
    "Barbell row in front of a MasterKraft power rack, with plate storage and specialty bars behind",
  "/category/cardio.jpg":
    "Training on a dual cable machine, skipping ropes and resistance bands hung on the wall behind",
  "/category/mixed-implements.jpg":
    "Kettlebell swing with a MasterKraft competition kettlebell, dumbbell rack behind",
  // Byte-identical to /fitout/home-gym.jpg.
  "/category/body-weight.jpg":
    "Step-ups on a stacked MasterKraft aerobic step, with plyo boxes and a skipping rope behind",
  "/fitout/home-gym.jpg":
    "Step-ups on a stacked MasterKraft aerobic step, with plyo boxes and a skipping rope behind",
  "/category/equipment-storage.jpg":
    "MasterKraft barbell and 10 kg bumper plate racked on plate storage",
  "/category/packages.jpg":
    "Four MasterKraft plyometric boxes in ascending heights",
  "/category/flooring.jpg":
    "Dumbbell squat on rubber gym flooring, with kettlebells and battle ropes around the floor",
  "/category/clearance.jpg":
    "Class stretching out on the floor of a blue-lit studio under an Air Locker wall graphic",
  "/fitout/school-gym.jpg":
    "School sports hall with a basketball hoop, timber floor and tiered seating",

  "/revl/full-studio.jpg":
    "REVL studio fitted out by MasterKraft — Concept2 RowErgs, benches, dumbbells and a rig",
  "/revl/wide-studio.jpg":
    "REVL studio floor with a rig, benches, dumbbell and kettlebell racks and wall balls",

  // The club-page banners. These are REVL studios, but the file names are not
  // the clubs' — shot-3.png and raffles-place.jpg are the same file, as are
  // shot-6.jpg and rowers-bw.jpg — so none of these names a city it might not
  // be standing in.
  "/revl/gallery/shot-1.jpg":
    "Athlete working on an air bike in a blacked-out training studio",
  "/revl/gallery/shot-2.png":
    "Lifter setting up over a loaded barbell on a gym floor",
  "/revl/gallery/shot-3.png":
    "Class training on Concept2 rowers and SkiErgs under a rig in a REVL studio",
  "/revl/gallery/raffles-place.jpg":
    "Class training on Concept2 rowers and SkiErgs under a rig in a REVL studio",
  "/revl/gallery/shot-4.jpg":
    "REVL studio floor with rigs, Concept2 RowErgs, air bikes and wall-ball storage",
  "/revl/gallery/shot-6.jpg":
    "Concept2 RowErgs in front of a REVL Training wall graphic and neon sign",
  "/revl/gallery/rowers-bw.jpg":
    "Concept2 RowErgs in front of a REVL Training wall graphic and neon sign",
  "/revl/gallery/skierg.jpg":
    "Athlete on a Concept2 SkiErg beside dumbbell racks and wall balls in a REVL studio",
  "/revl/gallery/cityhall.jpg":
    "REVL studio off a mall concourse — reception desk, rig, benches, plate storage and a row of kettlebells",
  "/revl/gallery/lower-pierce.jpg":
    "Rig, benches, kettlebells and plate storage on the floor of a blacked-out training studio",
};

/** The description of a photograph, or undefined if nobody has written one. */
export function heroAlt(src: string | undefined): string | undefined {
  if (!src) return undefined;
  return HERO_ALT[src];
}
