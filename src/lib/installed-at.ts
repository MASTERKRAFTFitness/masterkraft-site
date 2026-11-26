// "Installed at" strips on product pages: real club photos of a product in use,
// linking to the case study they come from. They sit below the product gallery,
// never in it, so they stay out of the product schema and the Merchant Center
// feed, which want clean product shots.
//
// Only list a product here when the club's sales order actually has it (or its
// branded twin), and caption each photo with what it shows. Hornsby's scope is
// SO-00000843: FFATSY01 branded turf -> public twin MFATCT01 Custom Turf;
// FSFTSFS02 (pink accessories) -> MSFTSFS02; MFRFRR01 tiles, which the photos show
// in black with a light fleck -> the Light Grey Fleck Impact-Lock family.

export type InstallPhoto = { src: string; alt: string; caption: string };

export type InstallShowcase = {
  club: string;
  place: string;
  href: string;
  // Shown under the heading: what this club has, in a sentence.
  note: string;
  photos: InstallPhoto[];
};

const HORNSBY = {
  club: "Fernwood Fitness Hornsby",
  place: "Hornsby, NSW",
  href: "/fitout/franchise-gym-fitout#fernwood-hornsby",
};

const SHOWCASES: { codes: string[]; showcase: InstallShowcase }[] = [
  {
    codes: ["MFATCT01"],
    showcase: {
      ...HORNSBY,
      note: "A 2 m x 10 m black track printed with the Fernwood script and metre markings, made to order and installed by our crew.",
      photos: [
        {
          src: "/fernwood/hornsby/02.jpg",
          alt: "Black turf track printed with the Fernwood Fitness script in pink",
          caption: "Fernwood-branded track",
        },
        {
          src: "/fernwood/hornsby/01.jpg",
          alt: "Fernwood Hornsby's functional zone with the branded turf track running down the middle",
          caption: "In the functional zone",
        },
      ],
    },
  },
  {
    codes: ["MSFTSFS02"],
    showcase: {
      ...HORNSBY,
      note: "Two Functional Training System 2.0 rigs run along the wall, with spotter arms, J-hooks and chin-up bars finished in Fernwood pink for the network.",
      photos: [
        {
          src: "/fernwood/hornsby/03.jpg",
          alt: "Functional Training System 2.0 rig with Fernwood-pink spotter arms, J-hooks and a loaded barbell",
          caption: "Fernwood-pink accessories",
        },
        {
          src: "/fernwood/hornsby/05.jpg",
          alt: "A MasterKraft installer building the wall-run rig and storage bays",
          caption: "Going up on install day",
        },
        {
          src: "/fernwood/hornsby/01.jpg",
          alt: "The finished rigs and storage bays along Fernwood Hornsby's pink wall",
          caption: "The finished wall",
        },
      ],
    },
  },
  {
    codes: ["MFRFRR01G", "MFRFRR03G", "MFRFRR04G", "MFRFRR05G"],
    showcase: {
      ...HORNSBY,
      note: "280 square metres of 20 mm Impact-Lock, laid over the club's old floor through the functional zone and the cardio line.",
      photos: [
        {
          src: "/fernwood/hornsby/04.jpg",
          alt: "Impact-Lock rubber tiles running along the cardio line at Fernwood Hornsby",
          caption: "Along the cardio line",
        },
        {
          src: "/fernwood/hornsby/06.jpg",
          alt: "Newly laid Impact-Lock rubber floor with rig frames laid out ready to build",
          caption: "Freshly laid",
        },
        {
          src: "/fernwood/hornsby/01.jpg",
          alt: "Fernwood Hornsby's finished functional zone on Impact-Lock rubber flooring",
          caption: "The finished zone",
        },
      ],
    },
  },
];

/** The first showcase that lists any of these product codes, if one does. */
export function installShowcaseFor(codes: (string | undefined | null)[]): InstallShowcase | undefined {
  const wanted = new Set(codes.filter(Boolean).map((c) => c!.trim().toUpperCase()));
  return SHOWCASES.find((s) => s.codes.some((c) => wanted.has(c)))?.showcase;
}
