import type { Metadata } from "next";

// THE PORTAL PAGES ARE DUPLICATES, ON PURPOSE. /portal/delivery-information,
// /portal/forms, /portal/our-process, /portal/process-overview and
// /portal/finance-legal render the same `contentPages` entries as the public
// pages at the same names - same words, different shell. Left indexable that is
// five pairs of duplicate pages competing with each other, and the public one is
// not guaranteed to be the winner.
//
// Declared here rather than on each page so a sixth portal page cannot be added
// without it: page-level metadata merges over a layout's, and these pages set
// only title and description, so this applies to all of them.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
