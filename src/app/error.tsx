"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="relative bg-carbon text-white overflow-hidden min-h-[70vh] flex items-center">
      <div className="absolute inset-0 mk-glow" aria-hidden />
      <div className="relative container-mk py-24 text-center">
        <p className="font-mono text-xs tracking-[0.3em] uppercase text-accent">Something went wrong</p>
        <h1 className="mt-5 text-4xl lg:text-6xl font-bold">We hit a snag</h1>
        <p className="mt-5 text-white/70 max-w-md mx-auto">
          Sorry about that. Try again, or head back home.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-4">
          <button onClick={reset} className="btn btn-accent">
            Try Again
          </button>
          <Link href="/" className="btn btn-outline">
            Back to Home
          </Link>
        </div>
      </div>
    </section>
  );
}
