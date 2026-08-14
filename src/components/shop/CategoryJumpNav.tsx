"use client";

import { useRouter } from "next/navigation";

export type JumpGroup = {
  label: string;
  slug: string;
  children: { slug: string; name: string }[];
};

// Dropdown to jump to a category (or sub-category) from the all-products listing.
// Each category is an <optgroup>; its sub-categories are nested options that
// deep-link to the category page pre-filtered to that sub-category.
export default function CategoryJumpNav({ groups }: { groups: JumpGroup[] }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-ash">
      Category
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) router.push(e.target.value);
        }}
        className="border border-line bg-white text-ink py-2 px-3 focus:outline-none focus:border-accent max-w-[16rem]"
      >
        <option value="">All Equipment</option>
        {groups.map((c) => (
          <optgroup key={c.slug} label={c.label}>
            <option value={`/equipment/${c.slug}`}>All {c.label}</option>
            {c.children.map((s) => (
              <option key={s.slug} value={`/equipment/${c.slug}?sub=${s.slug}`}>
                &nbsp;&nbsp;{s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
