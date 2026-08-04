import type { Metadata } from "next";
import ContentPage from "@/components/marketing/ContentPage";
import { contentPages } from "@/lib/content-pages";

const data = contentPages["finance-legal"];

export const metadata: Metadata = {
  title: `${data.title}`,
  description: data.subtitle,
};

export default function Page() {
  return <ContentPage {...data} />;
}
