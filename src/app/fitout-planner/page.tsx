import type { Metadata } from "next";
import Link from "next/link";
import Eyebrow from "@/components/ui/Eyebrow";
import FitoutPlanner from "@/components/planner/FitoutPlanner";
import { plannerCatalogue } from "@/lib/planner-catalogue";
import { getProductContent } from "@/lib/product-content";
import { getUnleashedMap } from "@/lib/unleashed";

// THE FITOUT PLANNER, a self-serve sketch of a gym floor in 3D.
//
// It sits beside /fitout-solution rather than replacing it: the brief wizard is
// still how a fitout reaches the design team, and the planner hands it a layout
// link and an equipment list (FitoutPlanner's "Send to our design team").
//
// The equipment, photos, prices and assembled sizes are read here, on the
// server, from the same sources as the product pages (lib/planner-catalogue),
// and cached like them.

export const revalidate = 600;

export const metadata: Metadata = {
  title: "3D Gym Fitout Planner | Lay Out Your Gym Floor",
  description:
    "Plan your gym floor in 3D with MasterKraft equipment at its real size. Set your room, add strength, cardio and racks, then send the layout to our design team.",
  alternates: { canonical: "/fitout-planner" },
};

export default async function FitoutPlannerPage() {
  const [map, content] = await Promise.all([getUnleashedMap().catch(() => ({})), getProductContent()]);
  const products = plannerCatalogue(map, content);

  return (
    <>
      <section className="bg-carbon text-white">
        <div className="container-mk pt-28 lg:pt-32 pb-10">
          <Eyebrow tone="dark" className="mb-4">
            Fitout Planner
          </Eyebrow>
          <h1 className="text-4xl lg:text-5xl font-bold leading-[1.05]">Plan your gym floor in 3D</h1>
          <p className="mt-4 max-w-2xl text-white/75 leading-relaxed">
            Set your room size, add MasterKraft equipment and move it into place. Products with a published assembled size
            are drawn at that size. When it looks right, send it to our design team for a full concept and price, or{" "}
            <Link href="/fitout-solution" className="underline underline-offset-2 hover:text-white">
              start a fitout brief
            </Link>{" "}
            instead.
          </p>
        </div>
      </section>
      <section className="bg-smoke">
        <div className="container-mk py-8">
          {products.length ? (
            <FitoutPlanner products={products} />
          ) : (
            <p className="border border-line bg-white p-6 text-sm text-ash">
              The equipment catalogue is not available right now. Please try again shortly, or{" "}
              <Link href="/fitout-solution" className="underline">
                send us a fitout brief
              </Link>
              .
            </p>
          )}
        </div>
      </section>
    </>
  );
}
