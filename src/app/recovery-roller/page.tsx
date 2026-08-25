import type { Metadata } from "next";
import Image from "next/image";
import WaitlistForm from "@/components/recovery-roller/WaitlistForm";
import { ARGUMENTS, RELEASE_LABEL, SPEC_ROWS } from "@/lib/recovery-roller";

// NO BENEFIT CLAIMS ANYWHERE ON THIS PAGE. See the note in lib/recovery-roller.ts.
// The light is "integrated" and nothing more, pending the TGA question.

export const metadata: Metadata = {
  title: "Recovery Roller",
  description:
    "A commercial recovery machine, built by MasterKraft. Register to get the specification and pricing before they go out generally.",
};

export default function RecoveryRollerPage() {
  return (
    <>
      {/* ---------- hero ---------- */}
      <section className="bg-[var(--color-ink)] text-white">
        <div className="container-mk grid grid-cols-1 items-center gap-10 py-16 md:grid-cols-[1.05fr_0.95fr] md:py-24">
          <div>
            <p className="font-mono text-[0.72rem] uppercase tracking-[0.2em] text-[var(--color-accent-300)]">
              {RELEASE_LABEL} &nbsp;/&nbsp; MasterKraft
            </p>
            <h1 className="mt-4 font-display text-4xl uppercase leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Are you taking recovery seriously?
              <span className="mt-1 block text-[var(--color-accent-300)]">
                Your members are.
              </span>
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg text-white/70">
              A commercial recovery machine, built by us, for gyms that want recovery to be
              a room rather than a corner. Same build for a single studio and a national
              network.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a href="#register" className="btn btn-accent">
                Get the spec sheet and pricing
              </a>
              <p className="max-w-[23ch] text-sm text-white/50">
                Sent the day each one is released.
              </p>
            </div>
          </div>

          <div className="flex justify-center">
            <Image
              src="/recovery-roller/roller-render.png"
              alt="The MasterKraft Recovery Roller, a motorised roller bed with an upholstered commercial housing."
              width={1040}
              height={760}
              priority
              className="h-auto w-full max-w-[520px] drop-shadow-2xl"
            />
          </div>
        </div>
      </section>

      {/* ---------- the argument ---------- */}
      <section className="container-mk py-16 md:py-20">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-12">
          {ARGUMENTS.map((a) => (
            <div key={a.title}>
              <span className="block h-[3px] w-16 rounded-sm bg-[var(--color-accent)]" />
              <h2 className="mt-4 font-display text-xl uppercase text-[var(--color-ink)]">
                {a.title}
              </h2>
              <p className="mt-2 text-[var(--color-ash)]">{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- the data sheet ---------- */}
      <section className="border-t border-[var(--color-line)] bg-[var(--color-smoke)]">
        <div className="container-mk py-16 md:py-20">
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-display text-3xl uppercase text-[var(--color-ink)]">
              The data sheet, so far
            </h2>
            <p className="max-w-[40ch] text-sm text-[var(--color-ash)]">
              Everything confirmed is below. The rest is released with the spec sheet and
              pricing.
            </p>
          </div>

          <dl className="border-t border-[var(--color-line)]">
            {SPEC_ROWS.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-1 gap-1 border-b border-[var(--color-line)] py-4 sm:grid-cols-[220px_1fr] sm:items-baseline sm:gap-6"
              >
                <dt className="font-mono text-[0.72rem] uppercase tracking-[0.13em] text-[var(--color-ash)]">
                  {row.label}
                </dt>
                {row.value ? (
                  <dd className="text-[var(--color-ink)]">{row.value}</dd>
                ) : (
                  <dd className="flex items-center gap-3 font-mono text-[0.8rem] tracking-[0.09em] text-[var(--color-ash)]">
                    <span className="h-[2px] w-4 flex-none rounded-sm bg-[var(--color-accent)] opacity-60" />
                    On release
                  </dd>
                )}
              </div>
            ))}
          </dl>

          <p className="mt-6 text-sm text-[var(--color-ash)]">
            Register below and the filled sheet comes to you first, with pricing.
          </p>
        </div>
      </section>

      {/* ---------- the teaser ---------- */}
      <section className="border-t border-[var(--color-line)]">
        <div className="container-mk grid grid-cols-1 items-center gap-10 py-16 md:grid-cols-[300px_1fr] md:gap-12">
          <video
            className="w-full max-w-[300px] rounded-sm border border-[var(--color-line)] bg-black"
            src="/recovery-roller/teaser.mp4"
            controls
            playsInline
            preload="metadata"
            aria-label="Fifteen second teaser of the Recovery Roller."
          />
          <div>
            <span className="block h-[3px] w-16 rounded-sm bg-[var(--color-accent)]" />
            <h2 className="mt-4 font-display text-2xl uppercase text-[var(--color-ink)]">
              The teaser
            </h2>
            <p className="mt-2 max-w-[52ch] text-[var(--color-ash)]">
              Fifteen seconds, no claims. What we can show you today is the machine and what
              it is made of. What it does for a member is a conversation for when the numbers
              are signed off.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- register ---------- */}
      <section
        id="register"
        className="scroll-mt-24 border-t border-[var(--color-line)] bg-[var(--color-smoke)]"
      >
        <div className="container-mk grid grid-cols-1 gap-10 py-16 md:grid-cols-[0.86fr_1.14fr] md:items-start md:gap-14 md:py-20">
          <div>
            <span className="block h-[3px] w-16 rounded-sm bg-[var(--color-accent)]" />
            <h2 className="mt-4 font-display text-3xl uppercase text-[var(--color-ink)]">
              Register
            </h2>
            <p className="mt-3 text-[var(--color-ash)]">
              First in line for the spec sheet and pricing.
            </p>
            <ul className="mt-6 grid gap-3">
              {[
                "The full specification, the day it is finalised",
                "Pricing before it goes out generally",
                "An early look at the unit when it lands",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[var(--color-ash)]">
                  <span className="mt-[0.7em] h-[2px] w-4 flex-none rounded-sm bg-[var(--color-accent)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <WaitlistForm />
        </div>
      </section>
    </>
  );
}
