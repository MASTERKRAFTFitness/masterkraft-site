"use client";

import { useRouter } from "next/navigation";
import { categories } from "@/lib/categories";

// Dropdown to jump to a category from the all-products listing.
export default function CategoryJumpNav() {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-ash">
      Category
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) router.push(e.target.value);
        }}
        className="border border-line bg-white text-ink py-2 px-3 focus:outline-none focus:border-accent"
      >
        <option value="">All Equipment</option>
        {categories.map((c) => (
          <option key={c.slug} value={`/equipment/${c.slug}`}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
