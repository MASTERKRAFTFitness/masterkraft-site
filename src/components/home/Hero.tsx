"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

// Lead banner is "Engineered for Fitness"; the rotating headings each map to a USP.
// `pos` = object-position focal point per image so the person stays cropped IN
// across the tall desktop hero and the narrow mobile crop (subjects sit off to
// one side / heads near the top in these shots).
const slides = [
  {
    tag: "Commercial Fitness Equipment & Fit-Out",
    heading: "Engineered for Fitness",
    body: "Bespoke solutions, uncompromising quality, honest affordability - premium equipment built by fitness professionals, for fitness professionals.",
    image: "/home/hero-1.jpg",
    pos: "50% 45%",
  },
  {
    tag: "The MasterKraft Difference",
    heading: "Honest Affordability",
    body: "Commercial-grade quality without the over-engineered price tag - value your P&L can justify.",
    image: "/home/hero-2.jpg",
    pos: "64% 35%",
  },
  {
    tag: "The MasterKraft Difference",
    heading: "Global Scale, Local Speed",
    body: "12 countries and 229 sites - warehoused near your markets and delivered in weeks, not months.",
    image: "/home/hero-3.jpg",
    pos: "38% 30%",
  },
  {
    tag: "The MasterKraft Difference",
    heading: "One Partner, Total Transparency",
    body: "One accountable supplier and fit-out partner across your whole group - ordering, tracking and support in one portal.",
    image: "/home/distributor.jpg",
    pos: "64% 42%",
  },
];

export default function Hero() {
  const [current, setCurrent] = useState(0);

  const go = useCallback(
    (dir: number) => setCurrent((c) => (c + dir + slides.length) % slides.length),
    []
  );

  useEffect(() => {
    const t = setInterval(() => setCurrent((c) => (c + 1) % slides.length), 6500);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative h-[86vh] min-h-[600px] w-full overflow-hidden bg-carbon text-white">
      {slides.map((s, i) => (
        <div
          key={i}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            i === current ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden={i !== current}
        >
          <Image
            src={s.image}
            alt=""
            fill
            priority={i === 0}
            className="object-cover"
            style={{ objectPosition: s.pos }}
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/25" />
        </div>
      ))}

      {/* Slide copy - anchored bottom-left like the liked reference */}
      <div className="relative z-10 h-full container-mk flex flex-col justify-end pb-20 lg:pb-24">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-[0.25em] uppercase text-accent mb-5">
            {slides[current].tag}
          </p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[0.95]">
            {slides[current].heading}
          </h1>
          <p className="mt-6 text-white/80 text-lg max-w-xl leading-relaxed">
            {slides[current].body}
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link href="/all-equipment" className="btn btn-accent">
              Shop the Range <span aria-hidden>→</span>
            </Link>
            <Link href="/fitout" className="btn btn-outline">
              Request a Fit-Out Solution
            </Link>
          </div>
        </div>
      </div>

      {/* Arrows */}
      <button
        onClick={() => go(-1)}
        aria-label="Previous slide"
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-12 w-12 hidden sm:flex items-center justify-center border border-white/30 hover:bg-accent hover:border-accent transition-colors"
      >
        ‹
      </button>
      <button
        onClick={() => go(1)}
        aria-label="Next slide"
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-12 w-12 hidden sm:flex items-center justify-center border border-white/30 hover:bg-accent hover:border-accent transition-colors"
      >
        ›
      </button>

      {/* Progress dots */}
      <div className="absolute bottom-8 right-5 lg:right-10 z-20 flex gap-1">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === current ? "true" : undefined}
            className="group grid place-items-center h-6 px-1"
          >
            <span
              className={`h-2 rounded-full transition-all block ${
                i === current ? "w-8 bg-accent" : "w-2 bg-white/50 group-hover:bg-white/80"
              }`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
