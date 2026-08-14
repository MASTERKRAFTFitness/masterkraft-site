// Central navigation + taxonomy config, mirroring masterkraft.com

export type NavLink = { label: string; href: string; highlight?: boolean };

// A top-level equipment category with its WooCommerce sub-categories + a hero
// image (shown in the header mega-menu). `children` are kept in sync with WC
// manually (they're stable); regenerate from /products/categories?parent=<id>.
export type EquipmentCategory = NavLink & {
  image?: string;
  children?: NavLink[];
};

// Equipment mega-menu: All Equipment first, then alphabetical, Clearance last
// (highlighted so it stands out).
export const equipmentCategories: EquipmentCategory[] = [
  { label: "All Equipment", href: "/all-equipment", image: "/category/body-weight.jpg" },
  {
    label: "Body Weight", href: "/equipment/body-weight", image: "/category/body-weight.jpg",
    children: [
      { label: "Aerobic Steps", href: "/equipment/body-weight?sub=aerobic-steps" },
      { label: "Balance & Stability", href: "/equipment/body-weight?sub=balance-stability" },
      { label: "Core Training", href: "/equipment/body-weight?sub=core-training" },
      { label: "Exercise Mats", href: "/equipment/body-weight?sub=exercise-mats" },
      { label: "Gymnastics", href: "/equipment/body-weight?sub=gymnastics" },
      { label: "Plyometric Boxes", href: "/equipment/body-weight?sub=plyometric-boxes" },
      { label: "Recovery & Mobility", href: "/equipment/body-weight?sub=recovery-mobility" },
      { label: "Resistance & Power Bands", href: "/equipment/body-weight?sub=resistance-power-bands" },
      { label: "Speed & Agility", href: "/equipment/body-weight?sub=speed-agility" },
      { label: "Suspension Trainer", href: "/equipment/body-weight?sub=suspension-trainer" },
    ],
  },
  {
    label: "Cardio", href: "/equipment/cardio", image: "/category/cardio.jpg",
    children: [
      { label: "Bikes", href: "/equipment/cardio?sub=bikes" },
      { label: "Rowers", href: "/equipment/cardio?sub=rowers" },
      { label: "Ski Trainer", href: "/equipment/cardio?sub=ski-trainer" },
      { label: "Treadmills", href: "/equipment/cardio?sub=treadmills" },
    ],
  },
  {
    label: "Equipment Storage", href: "/equipment/equipment-storage", image: "/category/equipment-storage.jpg",
    children: [
      { label: "Freestanding", href: "/equipment/equipment-storage?sub=freestanding" },
      { label: "Freestanding Storage", href: "/equipment/equipment-storage?sub=freestanding-storage" },
      { label: "Wall Mounted", href: "/equipment/equipment-storage?sub=wall-mounted" },
    ],
  },
  {
    label: "Flooring", href: "/equipment/flooring", image: "/category/flooring.jpg",
    children: [
      { label: "Astro Turf/Sled Tracks", href: "/equipment/flooring?sub=astro-turf-sled-tracks" },
      { label: "Rubber Flooring", href: "/equipment/flooring?sub=rubber-flooring" },
    ],
  },
  {
    label: "Mixed Implements", href: "/equipment/mixed-implements", image: "/category/mixed-implements.jpg",
    children: [
      { label: "Battle Ropes", href: "/equipment/mixed-implements?sub=battle-ropes" },
      { label: "Boxing", href: "/equipment/mixed-implements?sub=boxing" },
      { label: "Dead Balls", href: "/equipment/mixed-implements?sub=dead-balls" },
      { label: "Dumbbells", href: "/equipment/mixed-implements?sub=dumbbells" },
      { label: "Farmers Walk", href: "/equipment/mixed-implements?sub=farmers-walk" },
      { label: "Group Fitness", href: "/equipment/mixed-implements?sub=group-fitness" },
      { label: "Kettlebells", href: "/equipment/mixed-implements?sub=kettlebells" },
      { label: "Medicine Balls", href: "/equipment/mixed-implements?sub=medicine-balls" },
      { label: "Packages", href: "/equipment/mixed-implements?sub=packages-mixed-implements" },
      { label: "Power Bags", href: "/equipment/mixed-implements?sub=power-bags" },
      { label: "Sleds", href: "/equipment/mixed-implements?sub=sleds" },
      { label: "Wall Balls", href: "/equipment/mixed-implements?sub=wall-balls" },
    ],
  },
  {
    label: "Packages", href: "/equipment/packages", image: "/category/packages.jpg",
    children: [
      { label: "Barbells", href: "/equipment/packages?sub=barbells-packages-2" },
      { label: "Dead Balls", href: "/equipment/packages?sub=dead-balls-packages-2" },
      { label: "Dumbbells", href: "/equipment/packages?sub=dumbbells-packages-2" },
      { label: "Group Fitness", href: "/equipment/packages?sub=group-fitness-packages-2" },
      { label: "Kettlebells", href: "/equipment/packages?sub=kettlebells-packages-2" },
      { label: "Medicine Balls", href: "/equipment/packages?sub=medicine-balls-packages-2" },
      { label: "Power Bags", href: "/equipment/packages?sub=power-bags-packages-2" },
      { label: "Weight Plates", href: "/equipment/packages?sub=weight-plates-packages-2" },
    ],
  },
  {
    label: "Rigs & Racks", href: "/equipment/rigs-racks", image: "/category/rigs-racks.jpg",
    children: [
      { label: "Attachments", href: "/equipment/rigs-racks?sub=attachments" },
      { label: "Freestanding Rigs", href: "/equipment/rigs-racks?sub=freestanding-rigs-racks" },
      { label: "Squat & Power Racks", href: "/equipment/rigs-racks?sub=squat-power-racks" },
    ],
  },
  {
    label: "Strength", href: "/equipment/strength", image: "/category/strength.jpg",
    children: [
      { label: "Abdominal Machines", href: "/equipment/strength?sub=abdominal-machines" },
      { label: "Back Machines", href: "/equipment/strength?sub=back-machines" },
      { label: "Bicep & Tricep Machines", href: "/equipment/strength?sub=bicep-tricep-machines" },
      { label: "Cable Machines", href: "/equipment/strength?sub=cable-machines" },
      { label: "Chest & Shoulder Machines", href: "/equipment/strength?sub=chest-shoulder-machines" },
      { label: "Lower Body Machines", href: "/equipment/strength?sub=lower-body-machines" },
      { label: "Squat & Power Racks", href: "/equipment/strength?sub=squat-power-racks-strength" },
      { label: "Weight Benches", href: "/equipment/strength?sub=weight-benches" },
    ],
  },
  {
    label: "Weightlifting", href: "/equipment/weightlifting", image: "/category/weightlifting.jpg",
    children: [
      { label: "Barbells", href: "/equipment/weightlifting?sub=barbells" },
      { label: "Bumper Plates", href: "/equipment/weightlifting?sub=bumper-plates" },
      { label: "Weight Plates", href: "/equipment/weightlifting?sub=weight-plates" },
      { label: "Weightlifting Accessories", href: "/equipment/weightlifting?sub=weightlifting-accessories" },
    ],
  },
  { label: "Clearance", href: "/equipment/clearance", image: "/category/clearance.jpg", highlight: true },
];

export const fitoutLinks: NavLink[] = [
  { label: "Boutique Fitness", href: "/fitout/boutique-fitness-fitout" },
  { label: "Commercial Gym", href: "/fitout/commercial-gym-fitout" },
  { label: "Elite Sports Clubs", href: "/fitout/elite-sports-clubs-fitout" },
  { label: "Home Gym", href: "/fitout/home-gym-fitout" },
  { label: "PT Studio", href: "/fitout/pt-studio-fitout" },
  { label: "Schools & University", href: "/fitout/schools-university-fitout" },
];

// Primary category grid used on the homepage
export const shopByCategory: NavLink[] = [
  { label: "Body Weight", href: "/equipment/body-weight" },
  { label: "Cardio", href: "/equipment/cardio" },
  { label: "Flooring", href: "/equipment/flooring" },
  { label: "Mixed Implements", href: "/equipment/mixed-implements" },
  { label: "Rigs & Racks", href: "/equipment/rigs-racks" },
  { label: "Equipment Storage", href: "/equipment/equipment-storage" },
  { label: "Strength", href: "/equipment/strength" },
  { label: "Weightlifting", href: "/equipment/weightlifting" },
];

export const footerLinks: NavLink[] = [
  { label: "Contact Us", href: "/contact" },
  { label: "Warranty", href: "/warranty" },
  { label: "Returns", href: "/returns" },
  { label: "Finance", href: "/finance" },
  { label: "Shipping", href: "/shipping" },
  { label: "Delivery Information", href: "/delivery-information" },
  { label: "FitPass", href: "/fitpass" },
  { label: "Distributor", href: "/distributor" },
  { label: "Terms and Conditions", href: "/terms-and-conditions" },
  { label: "Privacy Policy", href: "/privacy-policy" },
];
