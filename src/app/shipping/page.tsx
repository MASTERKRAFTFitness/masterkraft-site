import type { Metadata } from "next";
import ContentPage from "@/components/marketing/ContentPage";
import { contentPages } from "@/lib/content-pages";

const data = contentPages["shipping"];

export const metadata: Metadata = {
  // `seoTitle` where the H1 is too short to be a search result on its own; see
  // the field on ContentPageData.
  title: data.seoTitle ?? data.title,
  description: data.subtitle,
  alternates: { canonical: "/shipping" },
};

export default function Page() {
  return <ContentPage {...data} collapsible />;
}
