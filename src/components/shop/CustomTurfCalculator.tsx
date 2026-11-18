"use client";

// Custom turf calculator: pick a width and length in whole metres, see the price,
// and send it to the team as a quote request.
//
// A QUOTE, NOT A CART LINE. A custom piece needs the customer's artwork and a
// person to confirm it before anything is cut, and the checkout prices every
// line from the ERP, which has no product for an arbitrary size. So it goes
// through /api/quote like a POA cart does: the team email and HubSpot both get
// the size, the area and the price the customer was shown. Pricing lives in
// lib/custom-turf.

import { useState } from "react";
import { HoneypotField, guardValues, useFillTimer } from "@/components/forms/guard";
import { identifyUser, trackLead } from "@/lib/analytics";
import { readAdClick } from "@/lib/ad-click";
import {
  TURF_CUSTOM_FEE_EX_GST,
  TURF_MAX_LENGTH_M,
  TURF_MAX_WIDTH_M,
  TURF_MIN_M,
  TURF_RATE_PER_M2_EX_GST,
  clampMetres,
  describeCustomTurf,
  priceCustomTurf,
} from "@/lib/custom-turf";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const fieldClass =
  "w-full px-4 py-3 border border-line bg-white text-ink placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors";

function MetrePicker({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const id = `turf-${label.toLowerCase()}`;
  // What is typed, kept apart from the value so clearing the box to type "12"
  // does not snap to 1 first. Clamped on blur; a valid number applies at once.
  const [draft, setDraft] = useState<string | null>(null);
  const step = (d: number) => {
    setDraft(null);
    onChange(clampMetres(value + d, max));
  };
  return (
    <div>
      <label htmlFor={id} className="block font-mono text-xs tracking-widest uppercase text-ash mb-2">
        {label} (m)
      </label>
      <div className="flex">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={value <= TURF_MIN_M}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="w-12 border border-line text-xl disabled:opacity-40 hover:border-accent"
        >
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={TURF_MIN_M}
          max={max}
          step={1}
          value={draft ?? value}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== "" && n >= TURF_MIN_M && n <= max) onChange(clampMetres(n, max));
          }}
          onBlur={() => {
            if (draft !== null) onChange(clampMetres(draft === "" ? value : Number(draft), max));
            setDraft(null);
          }}
          className="w-full min-w-0 border-y border-line text-center text-lg font-bold py-3 focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => step(1)}
          disabled={value >= max}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="w-12 border border-line text-xl disabled:opacity-40 hover:border-accent"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function CustomTurfCalculator() {
  const elapsed = useFillTimer();
  const [width, setWidth] = useState(2);
  const [length, setLength] = useState(10);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = priceCustomTurf(width, length);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const contact = {
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      company: String(form.get("company") ?? ""),
      location: String(form.get("location") ?? ""),
      notes: String(form.get("notes") ?? ""),
    };
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact,
          // No sku: there is no ERP product for an arbitrary size, so the
          // quote reaches the team by email and HubSpot, not the order book.
          // Price is inc. GST, the same as every cart line sent here.
          items: [{ id: 0, name: describeCustomTurf(q), qty: 1, price: q.totalIncGst }],
          subtotal: q.totalIncGst,
          adClick: readAdClick(),
          ...guardValues(form, elapsed()),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong.");
      if (data.accepted) {
        identifyUser(contact.email);
        trackLead(q.totalIncGst, 1, contact.email);
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="custom-turf" className="bg-white border-b border-line">
      <div className="container-mk py-12 lg:py-16 grid lg:grid-cols-2 gap-10">
        <div>
          <p className="font-mono text-xs tracking-widest text-accent-600 uppercase mb-3">Made to measure</p>
          <h2 className="text-3xl lg:text-4xl font-bold">Custom turf calculator</h2>
          <p className="mt-3 text-ash max-w-prose">
            Choose your width and length in 1m steps. Every piece is cut to size and printed with your design.
            The price is {aud.format(TURF_RATE_PER_M2_EX_GST)} per m² plus a once-off{" "}
            {aud.format(TURF_CUSTOM_FEE_EX_GST)} for design, print, cut and production (ex GST).
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <MetrePicker label="Width" value={width} max={TURF_MAX_WIDTH_M} onChange={setWidth} />
            <MetrePicker label="Length" value={length} max={TURF_MAX_LENGTH_M} onChange={setLength} />
          </div>

          <dl className="mt-8 border border-line divide-y divide-line text-sm" aria-live="polite">
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-ash">Area</dt>
              <dd className="font-bold">{q.areaM2} m²</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-ash">
                Turf ({q.areaM2} m² × {aud.format(TURF_RATE_PER_M2_EX_GST)})
              </dt>
              <dd>{aud.format(q.turfExGst)}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-ash">Custom design, print, cut &amp; production</dt>
              <dd>{aud.format(q.customFeeExGst)}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-ash">GST</dt>
              <dd>{aud.format(q.gst)}</dd>
            </div>
            <div className="flex justify-between items-baseline gap-4 px-4 py-4 bg-carbon text-white">
              <dt className="font-mono text-xs tracking-widest uppercase">Total inc. GST</dt>
              <dd className="text-2xl font-bold">{aud.format(q.totalIncGst)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-ash">
            {aud.format(q.totalExGst)} ex GST. Freight is quoted separately.
          </p>
        </div>

        <div>
          {done ? (
            <div className="border border-accent bg-accent/5 p-8 text-center">
              <p className="font-display uppercase tracking-wide text-lg">Thank you</p>
              <p className="mt-2 text-ash">
                We&apos;ve got your {q.widthM}m × {q.lengthM}m turf request and will be in touch to confirm your
                design and freight.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 relative">
              <p className="font-display uppercase tracking-wide text-lg">
                Request this turf: {q.widthM}m × {q.lengthM}m
              </p>
              <input name="name" required aria-label="Name" placeholder="Name" className={fieldClass} />
              <div className="grid sm:grid-cols-2 gap-4">
                <input name="email" required type="email" aria-label="Email" placeholder="Email" className={fieldClass} />
                <input name="phone" required type="tel" autoComplete="tel" aria-label="Phone" placeholder="Phone" className={fieldClass} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <input name="company" aria-label="Gym / company" placeholder="Gym / company" className={fieldClass} />
                <input name="location" aria-label="Suburb & postcode" placeholder="Suburb & postcode" className={fieldClass} />
              </div>
              <textarea
                name="notes"
                rows={4}
                aria-label="Your design"
                placeholder="Tell us about your design: logo, colours, lines or markings"
                className={fieldClass}
              />
              <HoneypotField />
              {error && <p className="text-accent-600 text-sm">{error}</p>}
              <button type="submit" disabled={sending} className="btn btn-accent w-full sm:w-auto disabled:opacity-60">
                {sending ? "Sending…" : `Request quote: ${aud.format(q.totalIncGst)}`} <span aria-hidden>→</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
