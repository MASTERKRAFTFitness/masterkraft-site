"use client";

import { useSyncExternalStore } from "react";
import {
  BRANDING_ABSORPTION,
  MEMBER_DISCOUNT_LABEL,
  PRICE_EXAMPLES,
  PRICING_CONFIRMED,
  savingPct,
} from "@/lib/indie-iron";

const aud = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ?pricing=draft, read in the browser so the page stays static.
const noop = () => () => {};
const isDraftView = () => new URLSearchParams(window.location.search).get("pricing") === "draft";

/**
 * Branded kit pricing: website, member and buying-group price for one example
 * size per line, then the branding fee. Hidden until PRICING_CONFIRMED (see
 * lib/indie-iron.ts); ?pricing=draft shows it with a draft banner for review.
 */
export default function PricingTable() {
  const draftView = useSyncExternalStore(noop, isDraftView, () => false);
  if (!PRICING_CONFIRMED && !draftView) return null;

  return (
    <section id="pricing" className="border-t border-[#C9CED5] py-14 md:py-20">
      <div className="container-mk">
        {!PRICING_CONFIRMED && (
          <p className="mb-6 rounded-sm bg-[var(--ii-yellow)] px-4 py-2 font-mono text-[0.75rem] font-bold uppercase tracking-[0.08em] text-[var(--ii-graphite)]">
            Draft pricing, to be confirmed. Not shown on the live page.
          </p>
        )}
        <div className="mb-10 grid grid-cols-1 items-end gap-4 md:grid-cols-2 md:gap-12">
          <div>
            <p className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.16em] text-[var(--ii-cobalt)]">
              Member pricing
            </p>
            <h2 className="ii-display mt-2.5 text-[2.6rem] leading-[0.95] sm:text-[3.4rem] lg:text-[4.1rem]">
              What your branded kit costs.
            </h2>
          </div>
          <p className="max-w-[52ch] text-ash">
            Members get {MEMBER_DISCOUNT_LABEL} the website price on every order. Order in a buy window and your order
            goes into the pooled production run at the buying-group price, the one the big networks buy at.
          </p>
        </div>

        {/* Phones: one card per line, so the buying-group price is never off-screen. */}
        <ul className="grid gap-3 sm:hidden">
          {PRICE_EXAMPLES.map((p) => (
            <li key={p.line} className="rounded-md border border-[#C9CED5] bg-white p-4">
              <p className="font-semibold">{p.line}</p>
              <p className="text-sm text-ash">{p.item}</p>
              <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                <dt className="text-ash">Website</dt>
                <dd className="text-right tabular-nums text-ash line-through decoration-1">{aud(p.website)}</dd>
                <dt>Member · {MEMBER_DISCOUNT_LABEL}</dt>
                <dd className="text-right tabular-nums">{aud(p.member)}</dd>
                <dt className="font-bold text-[var(--ii-cobalt)]">Buying group · save {savingPct(p.website, p.group)}%</dt>
                <dd className="text-right font-bold tabular-nums text-[var(--ii-cobalt)]">{aud(p.group)}</dd>
                <dt className="text-ash">Branding, once per size</dt>
                <dd className="text-right">{aud(p.fee).replace(".00", "")} <span className="text-ash">· {p.method}</span></dd>
              </dl>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-x-auto rounded-md border border-[#C9CED5] bg-white sm:block">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Branded kit prices, inc GST, one example size per line</caption>
            <thead className="bg-[var(--ii-graphite)] font-mono text-[0.7rem] uppercase tracking-[0.08em] text-white">
              <tr>
                <th scope="col" className="px-4 py-3 font-bold">Example</th>
                <th scope="col" className="px-4 py-3 text-right font-bold">Website</th>
                <th scope="col" className="px-4 py-3 text-right font-bold">Member · {MEMBER_DISCOUNT_LABEL}</th>
                <th scope="col" className="bg-[var(--ii-cobalt)] px-4 py-3 text-right font-bold">
                  Buying group
                </th>
                <th scope="col" className="px-4 py-3 font-bold">Branding, once per size</th>
              </tr>
            </thead>
            <tbody>
              {PRICE_EXAMPLES.map((p) => (
                <tr key={p.line} className="border-t border-[#E3E6EA]">
                  <th scope="row" className="px-4 py-3 font-normal">
                    <span className="block font-semibold">{p.line}</span>
                    <span className="text-ash">{p.item}</span>
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums text-ash line-through decoration-1">{aud(p.website)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{aud(p.member)}</td>
                  <td className="bg-[#EEF2FD] px-4 py-3 text-right tabular-nums text-[var(--ii-cobalt)]">
                    <span className="font-bold">{aud(p.group)}</span>
                    <span className="block text-[0.75rem]">save {savingPct(p.website, p.group)}%</span>
                  </td>
                  <td className="px-4 py-3">
                    {aud(p.fee).replace(".00", "")} <span className="text-ash">· {p.method}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[0.8rem] text-ash">
          Product prices inc GST, per piece or pair. Branding fees ex GST, paid once per size however many you order.
          Every reorder of that size is branded at no extra cost.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-3.5 md:grid-cols-3">
          {BRANDING_ABSORPTION.map((b) => (
            <div key={b.over} className="rounded-md border border-[#C9CED5] bg-white p-5">
              <p className="font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ash">
                {b.over ? `Orders over ${aud(b.over).replace(".00", "")}` : "Orders up to $20,000"}
              </p>
              <p className="ii-display mt-1.5 text-[1.6rem] leading-none">{b.share}</p>
              <p className="mt-1 text-sm text-ash">of your branding fees</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.8rem] text-ash">
          Order value is the product total of one order, ex GST. Example: branding five sizes of bumper plates is $625
          once. Across 40 plates that&apos;s $15.63 a plate, $7.81 on an order over $20,000, and nothing over $50,000.
        </p>
      </div>
    </section>
  );
}
