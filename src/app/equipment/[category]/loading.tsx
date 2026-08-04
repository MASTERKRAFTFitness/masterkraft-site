import ProductGridSkeleton from "@/components/shop/ProductGridSkeleton";

export default function Loading() {
  return (
    <>
      <div className="bg-carbon h-64" />
      <section className="container-mk py-16">
        <ProductGridSkeleton count={12} />
      </section>
    </>
  );
}
