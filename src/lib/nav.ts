// Central navigation + taxonomy config, mirroring masterkraft.com

export type NavLink = { label: string; href: string; highlight?: boolean };

// Equipment dropdown: All Equipment first, then alphabetical, Clearance last
// (highlighted so it stands out).
export const equipmentCategories: NavLink[] = [
  { label: "All Equipment", href: "/all-equipment" },
  { label: "Body Weight", href: "/equipment/body-weight" },
  { label: "Cardio", href: "/equipment/cardio" },
  { label: "Equipment Storage", href: "/equipment/equipment-storage" },
  { label: "Flooring", href: "/equipment/flooring" },
  { label: "Mixed Implements", href: "/equipment/mixed-implements" },
  { label: "Packages", href: "/equipment/packages" },
  { label: "Rigs & Racks", href: "/equipment/rigs-racks" },
  { label: "Strength", href: "/equipment/strength" },
  { label: "Weightlifting", href: "/equipment/weightlifting" },
  { label: "Clearance", href: "/equipment/clearance", highlight: true },
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
