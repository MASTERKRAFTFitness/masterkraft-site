import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Big_Shoulders } from "next/font/google";
import WindowClock from "@/components/indie-iron/WindowClock";
import WindowCalendar from "@/components/indie-iron/WindowCalendar";
import JoinForm from "@/components/indie-iron/JoinForm";
import JoinHeading from "@/components/indie-iron/JoinHeading";
import PricingTable from "@/components/indie-iron/PricingTable";
import { ALONE, FAQ, IN_GROUP, RANGE, STEPS } from "@/lib/indie-iron";

// Indie Iron: a programme inside MasterKraft, so it keeps the global header and
// footer and the site's body type. Big Shoulders is for the Indie Iron headings
// only, and the cobalt palette is scoped to this page through --ii-* tokens.
//
// Editing rules are in lib/indie-iron.ts. The short version: "Buying Group" here,
// "Certified Independent Gym" only as what a member gets, and "6–8 weeks" is an
// approved exception that must not spread to other pages.
//
// The page is static. The countdown, the calendar and the window select are
// computed in the browser, so a build never freezes the dates.

const bigShoulders = Big_Shoulders({
  weight: "900",
  subsets: ["latin"],
  variable: "--font-big-shoulders",
  display: "swap",
});

export const metadata: Metadata = {
  // The root layout appends " | MASTERKRAFT".
  title: "Indie Iron: independent gym buying group",
  description:
    "Franchise buying power for independent gyms. Up to 20% off branded plates, kettlebells, dumbbells, medicine balls and fixed barbells, in four quarterly buy windows.",
  alternates: { canonical: "/indie-iron" },
};

const tokens = {
  "--ii-graphite": "#16191D",
  "--ii-zinc": "#ECEEF1",
  "--ii-cobalt": "#2350D8",
  "--ii-cobalt-light": "#5B82FF",
  "--ii-yellow": "#F2C230",
} as React.CSSProperties;

function Eyebrow({ children, tone = "cobalt" }: { children: React.ReactNode; tone?: "cobalt" | "yellow" }) {
  return (
    <p
      className={`font-mono text-[0.72rem] font-bold uppercase tracking-[0.16em] ${
        tone === "yellow" ? "text-[var(--ii-yellow)]" : "text-[var(--ii-cobalt)]"
      }`}
    >
      {children}
    </p>
  );
}

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-10 grid grid-cols-1 items-end gap-4 md:grid-cols-2 md:gap-12">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="ii-display mt-2.5 text-[2.6rem] leading-[0.95] text-[var(--ii-graphite)] sm:text-[3.4rem] lg:text-[4.1rem]">
          {title}
        </h2>
      </div>
      {children && <p className="max-w-[52ch] text-ash">{children}</p>}
    </div>
  );
}

const ICONS: Record<(typeof RANGE)[number]["icon"], React.ReactNode> = {
  plate: (
    <>
      <circle cx="28" cy="28" r="26" fill="var(--ii-graphite)" />
      <circle cx="28" cy="28" r="12" fill="var(--ii-cobalt)" />
      <circle cx="28" cy="28" r="5" fill="#fff" />
    </>
  ),
  kettlebell: (
    <>
      <path d="M18 22a10 10 0 0 1 20 0v4h-5v-4a5 5 0 0 0-10 0v4h-5z" fill="var(--ii-graphite)" />
      <circle cx="28" cy="38" r="16" fill="var(--ii-graphite)" />
      <rect x="20" y="34" width="16" height="8" rx="1" fill="var(--ii-cobalt)" />
    </>
  ),
  ball: (
    <>
      <circle cx="28" cy="28" r="24" fill="var(--ii-graphite)" />
      <path d="M6 26h44v4H6z" fill="var(--ii-cobalt)" />
    </>
  ),
  dumbbell: (
    <>
      <rect x="4" y="16" width="12" height="24" rx="3" fill="var(--ii-graphite)" />
      <rect x="40" y="16" width="12" height="24" rx="3" fill="var(--ii-graphite)" />
      <rect x="16" y="25" width="24" height="6" fill="var(--ii-cobalt)" />
    </>
  ),
  barbell: (
    <>
      <rect x="4" y="25" width="48" height="6" rx="2" fill="var(--ii-cobalt)" />
      <rect x="8" y="18" width="7" height="20" rx="2" fill="var(--ii-graphite)" />
      <rect x="41" y="18" width="7" height="20" rx="2" fill="var(--ii-graphite)" />
    </>
  ),
};

export default function IndieIronPage() {
  return (
    <div className={`${bigShoulders.variable} bg-[var(--ii-zinc)] text-[var(--ii-graphite)]`} style={tokens}>
      {/* ---------- hero ----------
          Dark, like every other hero on the site: the global header is
          transparent white-on-dark until the page scrolls. The lighter cobalt
          is the brand's dark-mode value, for contrast on graphite. */}
      <section className="bg-[var(--ii-graphite)] text-[var(--ii-zinc)]">
        <div className="container-mk grid grid-cols-1 items-center gap-10 pb-14 pt-28 md:grid-cols-[1.25fr_0.9fr] md:gap-14 md:pb-20 md:pt-36">
          <div className="min-w-0">
            <p className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.16em] text-[var(--ii-cobalt-light)]">
              Powered by MasterKraft
            </p>
            <h1 className="ii-display mt-3.5 text-[2.9rem] leading-[0.95] text-white sm:text-[4rem] lg:text-[5.6rem]">
              Franchise buying power.{" "}
              <span className="text-[var(--ii-cobalt-light)]">Independent by choice.</span>
            </h1>
            <p className="mt-5 max-w-[58ch] text-[1.1rem] leading-relaxed text-white/80 lg:text-[1.2rem]">
              Indie Iron pools orders from independent gyms into one quarterly buy, so you get the pricing the
              big chains get. Up to 20% off branded plates, kettlebells, medicine balls, dumbbells and fixed
              barbells, with your logo on every piece.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <a href="#join" className="ii-btn">Join free →</a>
              <span className="text-sm text-white/60">No membership fee. No lock-in.</span>
            </div>
            <dl className="mt-8 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/15 pt-5">
              {[
                ["20%", "up to, off the website price"],
                ["4×", "buy windows a year"],
                ["6–8 wks", "from window close to your floor"],
              ].map(([n, l]) => (
                <div key={n} className="font-mono text-[0.8rem] text-white/60">
                  <dt className="ii-display text-[2.1rem] leading-none text-white">{n}</dt>
                  <dd>{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <aside
            className="grid justify-items-center gap-6 rounded-md border border-white/15 bg-white/[0.04] p-6 sm:p-8"
            style={
              {
                "--clock-ink": "#FFFFFF",
                "--clock-muted": "rgb(255 255 255 / 0.6)",
                "--clock-accent": "var(--ii-cobalt-light)",
              } as React.CSSProperties
            }
          >
            <Image
              src="/indie-iron/indie-iron-logo-reverse.svg"
              alt="Indie Iron, independent gym buying group"
              width={420}
              height={360}
              priority
              className="h-auto w-full max-w-[300px]"
            />
            <WindowClock />
          </aside>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" className="border-t border-[#C9CED5] py-14 md:py-20">
        <div className="container-mk">
          <SectionHead eyebrow="How it works" title="One order. Every member gym.">
            Every quarter we open a buy window. Members add what they need, the window closes, and we place one
            pooled order at network volume. The price that comes back is the price you pay.
          </SectionHead>
          <ol className="grid grid-cols-1 border-t-[3px] border-[var(--ii-graphite)] sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="grid content-start gap-2.5 border-[#C9CED5] py-5 max-lg:border-b sm:px-5 sm:first:pl-0 lg:border-l lg:first:border-l-0"
              >
                <span className="font-mono text-[0.8rem] font-bold text-[var(--ii-cobalt)]">STEP {i + 1}</span>
                <h3 className="ii-display text-[1.75rem] leading-none">{s.title}</h3>
                <p className="text-[0.95rem] text-ash">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- the range ---------- */}
      <section id="range" className="border-t border-[#C9CED5] py-14 md:py-20">
        <div className="container-mk">
          <SectionHead eyebrow="The range" title="Five lines. Your logo on all of them.">
            Commercial-grade free weights, the same gear we supply to large franchise networks and independent gyms
            alike. Brand them as your gym, or run them as MasterKraft.
          </SectionHead>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
            {RANGE.map((r) => (
              <Link
                key={r.name}
                href={r.href}
                className="group grid grid-rows-[auto_auto_auto_1fr_auto] gap-2.5 rounded-md border border-[#C9CED5] bg-white p-5 transition-colors hover:border-[var(--ii-cobalt)]"
              >
                {"image" in r ? (
                  // The product shots carry a lot of studio backdrop; scaled up
                  // inside a clipped frame so the branding is legible on a card.
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-sm bg-[#E9E9E9]">
                    <Image
                      src={r.image.src}
                      alt={r.image.alt}
                      width={r.image.width}
                      height={r.image.height}
                      sizes="(min-width: 1024px) 360px, (min-width: 640px) 70vw, 100vw"
                      className="h-full w-full scale-[1.6] object-cover"
                    />
                  </div>
                ) : (
                  <div className="grid aspect-[4/3] w-full place-items-center rounded-sm bg-[var(--ii-zinc)]">
                    <svg viewBox="0 0 56 56" className="h-16 w-16" aria-hidden>
                      {ICONS[r.icon]}
                    </svg>
                  </div>
                )}
                <h3 className="ii-display text-[1.4rem] leading-none">{r.name}</h3>
                <p className="font-mono text-[0.75rem] uppercase tracking-[0.02em] text-ash">{r.spec}</p>
                <p className="text-sm text-ash">{r.body}</p>
                <span className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[var(--ii-cobalt)]">
                  See the range <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-[0.95rem]">
            {["Your logo", "MasterKraft"].map((c) => (
              <span key={c} className="rounded-full border-[1.5px] border-[var(--ii-graphite)] px-3 py-1 font-mono text-[0.75rem] font-bold uppercase tracking-[0.06em]">
                {c}
              </span>
            ))}
            <span>Pick one per order. We send a proof before anything is made.</span>
          </div>
          <p className="mt-3 text-[0.8rem] text-ash">
            Photos show MasterKraft branding; your logo goes in the same place. Weight ranges are indicative and
            confirmed on your quote.
          </p>
        </div>
      </section>

      {/* ---------- member pricing (hidden until confirmed) ---------- */}
      <PricingTable />

      {/* ---------- buy calendar ---------- */}
      <section id="windows" className="border-t border-[#C9CED5] py-14 md:py-20">
        <div className="container-mk">
          <SectionHead eyebrow="Buy calendar" title="Four windows a year.">
            Orders close at 11:59 pm Melbourne time on the 15th of February, May, August and November. Plan your
            floor around the date that suits you.
          </SectionHead>
          <WindowCalendar />
          <p className="mt-5 max-w-[70ch] text-sm text-ash">
            Delivery is 6–8 weeks from the close date. The founding round is timed so new gear lands for the January
            rush.
          </p>
        </div>
      </section>

      {/* ---------- why it works ---------- */}
      <section className="border-t border-[#C9CED5] py-14 md:py-20">
        <div className="container-mk">
          <SectionHead eyebrow="Why it works" title="The chains don't pay more. Neither should you.">
            Franchise networks get their price from volume. Indie Iron gives independents that same volume, without
            giving up your name over the door.
          </SectionHead>
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <div className="grid content-start gap-3.5 rounded-md border border-[#C9CED5] p-6 sm:p-7">
              <Eyebrow>Ordering on your own</Eyebrow>
              <h3 className="ii-display text-[2.1rem] leading-none">One gym, one small order</h3>
              <ul className="grid gap-2.5">
                {ALONE.map((l) => (
                  <li key={l} className="relative pl-6 before:absolute before:left-0 before:top-[0.65em] before:h-[3px] before:w-2.5 before:bg-current">
                    {l}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid content-start gap-3.5 rounded-md bg-[var(--ii-graphite)] p-6 text-[var(--ii-zinc)] sm:p-7">
              <Eyebrow tone="yellow">In the group</Eyebrow>
              <h3 className="ii-display text-[2.1rem] leading-none">Your order rides with everyone&apos;s</h3>
              <ul className="grid gap-2.5">
                {IN_GROUP.map((l) => (
                  <li key={l} className="relative pl-6 before:absolute before:left-0 before:top-[0.65em] before:h-[3px] before:w-2.5 before:bg-current">
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- certified (what a member gets) ---------- */}
      <section id="certified" className="border-t border-[#C9CED5] py-14 md:py-20">
        <div className="container-mk grid grid-cols-1 items-center gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-14">
          <Image
            src="/indie-iron/indie-iron-seal.svg"
            alt="The Indie Iron Certified Independent Gym member badge"
            width={420}
            height={360}
            className="mx-auto h-auto w-full max-w-[340px]"
          />
          <div>
            <Eyebrow>What you get</Eyebrow>
            <h2 className="ii-display mt-2.5 text-[2.6rem] leading-[0.95] sm:text-[3.4rem]">
              Certified Independent Gym.
            </h2>
            <p className="mt-5 max-w-[56ch] text-[1.05rem] leading-relaxed">
              Every member gym gets the Indie Iron badge for its website, socials and front door, and it&apos;s
              engraved on your branded gear. It tells your members you&apos;re independently owned and part of the
              group.
            </p>
            {/* Criteria line goes here once agreed (open item 5). */}
          </div>
        </div>
      </section>

      {/* ---------- join ---------- */}
      <section id="join" className="scroll-mt-24 border-t border-[#C9CED5] py-14 md:py-20">
        <div className="container-mk grid grid-cols-1 gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-14">
          <div>
            <Eyebrow>Join Indie Iron</Eyebrow>
            <h2 className="ii-display mt-2.5 text-[2.8rem] leading-[0.95] sm:text-[3.6rem] lg:text-[4.4rem]">
              <JoinHeading />
            </h2>
            <p className="mt-4 max-w-[44ch] text-ash">
              Joining is free. We&apos;ll send member pricing for the five lines and the order form for the next
              window. You only pay when you order.
            </p>
            <ul className="mt-5 grid gap-2.5 text-[0.95rem]">
              {["No membership fee", "No lock-in, order in the windows you want", "Branding proof before production"].map((l) => (
                <li key={l} className="flex gap-2.5">
                  <span aria-hidden className="font-bold text-[var(--ii-cobalt)]">✓</span>
                  {l}
                </li>
              ))}
            </ul>
          </div>
          <JoinForm />
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="border-t border-[#C9CED5] py-14 md:py-20">
        <div className="container-mk">
          <SectionHead eyebrow="Questions" title="The fine print, in plain words." />
          <div className="grid grid-cols-1 gap-x-12 md:grid-cols-2">
            {FAQ.map((f) => (
              <details key={f.q} className="border-t border-[#C9CED5] py-4">
                <summary className="cursor-pointer text-[1.05rem] font-bold">{f.q}</summary>
                <p className="mt-2.5 max-w-[56ch] text-ash">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
