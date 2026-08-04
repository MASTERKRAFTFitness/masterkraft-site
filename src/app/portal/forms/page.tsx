import type { Metadata } from "next";
import ContentPage from "@/components/marketing/ContentPage";
import { contentPages } from "@/lib/content-pages";

const data = contentPages["forms"];

export const metadata: Metadata = {
  title: `${data.title} Portal`,
  description: data.subtitle,
};

export default function Page() {
  return <ContentPage {...data} />;
}
