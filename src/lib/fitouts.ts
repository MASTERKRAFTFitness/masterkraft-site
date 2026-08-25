export type Fitout = {
  slug: string;
  name: string;
  blurb: string;
  image: string;
  intro: string;
  points: string[];
};

export const fitouts: Fitout[] = [
  {
    slug: "boutique-fitness-fitout",
    name: "Boutique Fitness",
    blurb: "High-impact studio fitouts engineered for group energy and fast member throughput.",
    image: "/category/cardio.jpg",
    intro:
      "Boutique studios live and die by atmosphere and reliability. We design floor layouts that move members through a session seamlessly, with equipment built to survive back-to-back classes.",
    points: [
      "Rigs, functional zones and conditioning gear laid out for group flow",
      "Custom branding and colourways to match your studio identity",
      "Hard-wearing finishes that hold up to constant high-intensity use",
    ],
  },
  {
    slug: "commercial-gym-fitout",
    name: "Commercial Gym",
    blurb: "Complete commercial gym solutions - from a single zone to a full multi-level facility.",
    image: "/home/fitouts.jpg",
    intro:
      "A commercial floor has to satisfy every member, from first-timers to serious lifters. We deliver a complete, cohesive fitout across strength, weightlifting, cardio and functional training.",
    points: [
      "End-to-end design, supply and installation",
      "Balanced equipment mix across every training modality",
      "Volume pricing and staged delivery to your build schedule",
    ],
  },
  {
    slug: "elite-sports-clubs-fitout",
    name: "Elite Sports Clubs",
    blurb: "Performance environments for professional athletes and high-performance programs.",
    image: "/category/rigs-racks.jpg",
    intro:
      "Elite programs demand equipment that performs under maximal load, day after day. We specify and build strength and conditioning spaces to the standard your athletes expect.",
    points: [
      "Competition-grade platforms, racks and bars",
      "Durable, calibrated equipment for measurable performance",
      "Layouts optimised for coached, high-throughput sessions",
    ],
  },
  {
    slug: "home-gym-fitout",
    name: "Home Gym",
    blurb: "Premium home setups that bring commercial-grade quality into your own space.",
    image: "/fitout/home-gym.jpg",
    intro:
      "Your home gym should be built to last. We help you make the most of the space you have with commercial-grade equipment scaled for the home.",
    points: [
      "Space-efficient rigs, benches and free weights",
      "Commercial build quality for a lifetime of training",
      "Tailored recommendations for your goals and footprint",
    ],
  },
  {
    slug: "pt-studio-fitout",
    name: "PT Studio",
    blurb: "Compact, versatile studios that maximise revenue per square metre.",
    image: "/category/strength.jpg",
    intro:
      "A personal training studio needs to do a lot in a small footprint. We design flexible, multi-use spaces that let you coach any client, any session.",
    points: [
      "Versatile functional zones in a compact footprint",
      "Equipment that covers strength, conditioning and mobility",
      "Fast fitout so you can start training sooner",
    ],
  },
  {
    slug: "schools-university-fitout",
    name: "Schools & University",
    blurb: "Safe, durable and inclusive training spaces for education and campus facilities.",
    image: "/fitout/school-gym.jpg",
    intro:
      "Education facilities need equipment that is safe, robust and suitable for a wide range of users. We deliver inclusive spaces built to institutional standards.",
    points: [
      "Durable, low-maintenance equipment for high-traffic use",
      "Inclusive layouts suitable for all ages and abilities",
      "Compliant flooring and storage solutions",
    ],
  },
];

export function getFitout(slug: string) {
  return fitouts.find((f) => f.slug === slug);
}
