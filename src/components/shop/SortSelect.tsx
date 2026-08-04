"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
  { value: "newest", label: "Newest" },
];

export default function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const p = new URLSearchParams(params.toString());
    if (e.target.value === "featured") p.delete("sort");
    else p.set("sort", e.target.value);
    p.delete("page");
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-ash">
      Sort
      <select
        value={value}
        onChange={onChange}
        className="border border-line bg-white text-ink py-2 px-3 focus:outline-none focus:border-accent"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
