import Image from "next/image";

// Loading wheel built from the MasterKraft "M" circle mark.
export default function BrandSpinner({
  size = 48,
  label = "Loading",
}: {
  size?: number;
  label?: string;
}) {
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <Image
        src="/brand/logo-circle.svg"
        alt=""
        width={size}
        height={size}
        className="mk-spin"
        priority
      />
    </span>
  );
}
