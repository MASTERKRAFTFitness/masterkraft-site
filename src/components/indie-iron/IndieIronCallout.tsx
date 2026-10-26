import Image from "next/image";
import Link from "next/link";

// A pointer to /indie-iron from the pages independent gym owners land on (the
// boutique fit-out page). Site palette, not the Indie Iron one: it sits inside a
// MasterKraft page. No lead time here - "6–8 weeks" stays on /indie-iron only.
export default function IndieIronCallout() {
  return (
    <section className="bg-ink text-white">
      <div className="container-mk grid grid-cols-1 items-center gap-8 py-14 md:grid-cols-[220px_1fr_auto] md:gap-12">
        <Image
          src="/indie-iron/indie-iron-logo-reverse.svg"
          alt="Indie Iron, independent gym buying group"
          width={420}
          height={360}
          className="h-auto w-full max-w-[200px]"
        />
        <div>
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.2em] text-accent-300">
            For independent gyms
          </p>
          <h2 className="mt-3 font-display text-3xl uppercase">Franchise buying power, without the franchise.</h2>
          <p className="mt-3 max-w-[60ch] text-white/70">
            Indie Iron pools orders from independent gyms into one quarterly buy. 10% off the website price on all
            MasterKraft equipment, and up to 20% off when you order in a buy window. Free to join.
          </p>
        </div>
        <Link href="/indie-iron" className="btn btn-accent">
          About Indie Iron
        </Link>
      </div>
    </section>
  );
}
