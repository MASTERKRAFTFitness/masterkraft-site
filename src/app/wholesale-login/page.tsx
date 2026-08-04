import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PageHero from "@/components/marketing/PageHero";
import { PORTAL_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Portal Login",
  description: "Sign in to the MasterKraft wholesale partner portal.",
};

const fieldClass =
  "w-full px-4 py-3 border border-line bg-white text-ink placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors";

export default function WholesaleLoginPage() {
  // Once the portal app has a domain, hand off directly to it.
  if (PORTAL_URL) redirect(PORTAL_URL);
  return (
    <>
      <PageHero eyebrow="Wholesale" title="Portal Login" subtitle="Sign in to order, track and manage your account." />
      <section className="container-mk py-20 max-w-md">
        <form className="space-y-4">
          <input type="email" aria-label="Email" placeholder="Email" className={fieldClass} required />
          <input type="password" aria-label="Password" placeholder="Password" className={fieldClass} required />
          <button type="submit" className="btn btn-accent w-full">
            Sign In
          </button>
        </form>
        <p className="mt-6 text-ash text-sm">
          Not a partner yet?{" "}
          <Link href="/distributor" className="underline decoration-accent-600 underline-offset-2">
            Become a distributor
          </Link>{" "}
          or{" "}
          <Link href="/contact" className="underline decoration-accent-600 underline-offset-2">
            contact us
          </Link>
          .
        </p>
      </section>
    </>
  );
}
