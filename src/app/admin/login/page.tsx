import { Suspense } from "react";
import type { Metadata } from "next";
import AdminLoginForm from "@/components/admin/AdminLoginForm";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <section className="container-mk py-24 max-w-sm">
      <h1 className="font-display text-2xl uppercase tracking-wide text-ink">Support desk</h1>
      <p className="mt-2 text-sm text-ash">Internal use. MasterKraft staff only.</p>
      {/* useSearchParams needs a boundary, or the build fails on prerender. */}
      <Suspense fallback={null}>
        <AdminLoginForm />
      </Suspense>
    </section>
  );
}
