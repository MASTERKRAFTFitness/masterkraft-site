import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";
import { categories } from "@/lib/categories";

export const metadata: Metadata = {
  title: "All Equipment",
  description:
    "Shop the full MasterKraft range - strength, weightlifting, cardio, rigs & racks, flooring, storage and more.",
  alternates: { canonical: "/all-equipment" },
};

export default function AllEquipmentPage() {
  return (
    <>
      <PageHero
        eyebrow="Shop Equipment"
        title="All Equipment"
        subtitle="Commercial-grade equipment across every training modality - engineered for fitness, built to endure."
        image="/home/shop-equipment.jpg"
      />

      <section className="container-mk py-20">
        <Eyebrow className="mb-10">Shop by Category</Eyebrow>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map((c) => (
            <Link key={c.slug} href={`/equipment/${c.slug}`} className="group relative aspect-square overflow-hidden bg-carbon">
              <Image
                src={c.image}
                alt={c.label}
                fill
                className="object-cover opacity-70 transition-all duration-500 group-hover:opacity-90 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <h3 className="text-white text-lg font-semibold group-hover:text-accent transition-colors">
                  {c.label}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
