import Link from "next/link";

export default function NotFound() {
  return (
    <section className="relative bg-carbon text-white overflow-hidden min-h-[70vh] flex items-center">
      <div className="absolute inset-0 mk-glow" aria-hidden />
      <div className="relative container-mk py-24 text-center">
        <p className="font-mono text-xs tracking-[0.3em] uppercase text-accent-600">Error 404</p>
        <h1 className="mt-5 text-5xl lg:text-7xl font-bold">Page not found</h1>
        <p className="mt-5 text-white/70 max-w-md mx-auto">
          The page you&apos;re looking for has moved or no longer exists.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-4">
          <Link href="/" className="btn btn-accent">
            Back to Home
          </Link>
          <Link href="/all-equipment" className="btn btn-outline">
            Shop Equipment
          </Link>
        </div>
      </div>
    </section>
  );
}
