import BrandSpinner from "@/components/ui/BrandSpinner";

export default function Loading() {
  return (
    <>
      <div className="bg-carbon h-56" />
      <div className="container-mk py-28 flex justify-center">
        <BrandSpinner size={56} />
      </div>
    </>
  );
}
