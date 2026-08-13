import BrandSpinner from "@/components/ui/BrandSpinner";

export default function Loading() {
  return (
    <>
      <div className="bg-carbon h-24" />
      <div className="container-mk py-32 flex justify-center">
        <BrandSpinner size={56} />
      </div>
    </>
  );
}
