// Icons for the fit-out brief's tap-cards, keyed by the `icon` strings in
// lib/fitout-brief.ts.
//
// Inline SVG rather than an icon package: nineteen glyphs is not worth a
// dependency, and these need to inherit `currentColor` so a selected card can
// flip the whole card - border, label and glyph - to the accent in one class.
//
// All on a 24x24 box with a 1.6 stroke, which is the weight the rest of the site's
// hand-drawn icons use (see Footer's social set).

const paths: Record<string, React.ReactNode> = {
  // Project types
  building: (
    <>
      <path d="M3 21h18M5 21V6l7-3 7 3v15" />
      <path d="M9 21v-5h6v5M9 9h2M13 9h2M9 12.5h2M13 12.5h2" />
    </>
  ),
  spark: (
    <>
      <path d="M12 2.5 14.2 9l6.8.3-5.4 4.2 1.9 6.6L12 16.3 6.5 20.1l1.9-6.6L3 9.3 9.8 9z" />
    </>
  ),
  home: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5.5h4V20" />
    </>
  ),
  whistle: (
    <>
      <path d="M3 10.5h9l3-2v7l-3-2H3z" />
      <circle cx="17.5" cy="12" r="4" />
      <path d="M12 4.5h4" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 5.5H5.5v1A3.5 3.5 0 0 0 8 9.8M16 5.5h2.5v1A3.5 3.5 0 0 1 16 9.8" />
      <path d="M12 13v4M9 20h6M10 17h4l.5 3h-5z" />
    </>
  ),
  school: (
    <>
      <path d="M12 3 2.5 7.5 12 12l9.5-4.5z" />
      <path d="M6 10v5.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V10" />
      <path d="M21.5 7.5v5" />
    </>
  ),
  // Stages
  bolt: <path d="M13.5 2.5 5 13.5h5l-1 8 9-11.5h-5z" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M7.5 13.5h3M7.5 17h3M13.5 13.5h3" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 17.5a5.5 5.5 0 1 1 6 0v1.5H9z" />
      <path d="M9.5 21.5h5" />
    </>
  ),
  // Branding
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.3 0 1.8-.9 1.8-1.8 0-1.6-1.4-1.9-1.4-3.1 0-1 .8-1.6 1.9-1.6h1.4A5.3 5.3 0 0 0 21 9.2C21 5.6 16.9 3 12 3z" />
      <circle cx="8" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="14" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M8 12.2l2.8 2.8L16 9.8" />
    </>
  ),
  // Zones
  cardio: (
    <>
      <path d="M3 15h3l2-5 2.5 8L13 7l2 8h6" />
    </>
  ),
  machine: (
    <>
      <path d="M4 4v16M4 8h7a4 4 0 0 1 0 8H8" />
      <path d="M16 20h4M18 20v-6" />
      <rect x="14.5" y="8.5" width="7" height="3" rx="0.6" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M8 12h8" />
      <rect x="3" y="8.5" width="3" height="7" rx="0.8" />
      <rect x="18" y="8.5" width="3" height="7" rx="0.8" />
      <path d="M6.5 10.5v3M17.5 10.5v3" />
    </>
  ),
  rig: (
    <>
      <path d="M5 3v18M19 3v18M5 7h14M5 12h14M5 17h14" />
    </>
  ),
  turf: (
    <>
      <path d="M3 20h18" />
      <path d="M6 20c0-3 .5-5 2-6.5M10 20c0-4 .3-6.5 1.5-8.5M14 20c0-3.5.4-5.8 1.6-7.5M18 20c0-2.6.3-4.3 1.2-5.5" />
    </>
  ),
  group: (
    <>
      <circle cx="8" cy="8" r="2.6" />
      <circle cx="16.5" cy="9" r="2.2" />
      <path d="M3.5 19.5c0-2.8 2-4.8 4.5-4.8s4.5 2 4.5 4.8" />
      <path d="M14 19.5c0-2.3 1.3-4 3-4s3 1.7 3 4" />
    </>
  ),
  recovery: (
    <>
      <path d="M20.5 9.2c0-2.3-1.8-4-4-4-1.8 0-3.4 1.1-4.5 2.8C10.9 6.3 9.3 5.2 7.5 5.2c-2.2 0-4 1.7-4 4 0 4.6 8.5 9.6 8.5 9.6s8.5-5 8.5-9.6z" />
    </>
  ),
  storage: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15.5" rx="1.2" />
      <path d="M3.5 10h17M3.5 15h17M10.5 7.2h3M10.5 12.4h3M10.5 17.6h3" />
    </>
  ),
};

export default function BriefIcon({
  name,
  className = "",
}: {
  name?: string;
  className?: string;
}) {
  const path = name ? paths[name] : null;
  if (!path) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}
