"use client";

import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/admin/login", { method: "DELETE" });
        router.replace("/admin/login");
        router.refresh();
      }}
      className="text-xs text-ash underline underline-offset-2 hover:text-ink transition-colors"
    >
      Sign out
    </button>
  );
}
