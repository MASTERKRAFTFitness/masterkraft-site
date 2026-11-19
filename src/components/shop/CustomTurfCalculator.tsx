"use client";

// The buy box of the Custom Turf product page (MFATCT01): enter any width and
// length (to the millimetre, inside the bounds in lib/custom-turf), see the
// price, and send it as a quote request. What is typed is used exactly; the
// only rounding is the price, up to the whole dollar.
//
// A QUOTE, NOT A CART LINE. A custom piece needs the customer's artwork and a
// person to confirm it before anything is cut, so it goes through /api/quote
// like a POA cart does, never to card checkout (lib/custom-turf isQuoteOnlyCode
// keeps it out of the cart and the payment path too). The request is one line,
// MFATCT01 x 1, carrying the size; the server works the price out from the size
// (lib/orders placeQuote) rather than trusting this one. The size also leads
// the notes, so it reads plainly in the email and HubSpot.

import { useState } from "react";
import { HoneypotField, guardValues, useFillTimer } from "@/components/forms/guard";
import { trackLead } from "@/lib/analytics";
import { readAdClick } from "@/lib/ad-click";
import {
  CUSTOM_TURF_CODE,
  TURF_CUSTOM_FEE_EX_GST,
  TURF_MAX_LENGTH_M,
  TURF_MAX_WIDTH_M,
  TURF_MIN_M,
  TURF_RATE_PER_M2_EX_GST,
  describeCustomTurf,
  formatMetres,
  parseTurfMetres,
  priceCustomTurf,
  turfSizeLabel,
} from "@/lib/custom-turf";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const fieldClass =
  "w-full px-4 py-3 border border-line bg-white text-ink placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors";

// The +/− buttons nudge by half a metre. Typing is never snapped to it.
const NUDGE_M = 0.5;

function MetrePicker({
  label,
  text,
  max,
  onChange,
}: {
  label: string;
  /** Exactly what is in the box. The parent parses it; nothing here rewrites it. */
  text: string;
  max: number;
  onChange: (text: string) => void;
}) {
  const id = `turf-${label.toLowerCase()}`;
  const value = parseTurfMetres(text, max);
  const invalid = value === null;
  const nudge = (d: number) => {
    const from = value ?? TURF_MIN_M;
    // Back to three places, so 0.1 + 0.5 does not show float noise.
    const next = Math.min(max, Math.max(TURF_MIN_M, Math.round((from + d) * 1000) / 1000));
    onChange(formatMetres(next));
  };
  return (
    <div>
      <label htmlFor={id} className="block font-mono text-xs tracking-widest uppercase text-ash mb-2">
        {label} (m)
      </label>
      <div className="flex">
        <button
          type="button"
          onClick={() => nudge(-NUDGE_M)}
          disabled={value !== null && value <= TURF_MIN_M}
          aria-label={`Decrease ${label.toLowerCase()} by ${NUDGE_M}m`}
          className="w-12 border border-line text-xl disabled:opacity-40 hover:border-accent"
        >
          −
        </button>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className={`w-full min-w-0 border-y text-center text-lg font-bold py-3 focus:outline-none focus:border-accent ${
            invalid ? "border-accent-600 text-accent-600" : "border-line"
          }`}
        />
        <button
          type="button"
          onClick={() => nudge(NUDGE_M)}
          disabled={value !== null && value >= max}
          aria-label={`Increase ${label.toLowerCase()} by ${NUDGE_M}m`}
          className="w-12 border border-line text-xl disabled:opacity-40 hover:border-accent"
        >
          +
        </button>
      </div>
      {invalid && (
        <p id={`${id}-error`} className="mt-1 text-xs text-accent-600">
          Enter {TURF_MIN_M}m to {max}m, up to 3 decimal places.
        </p>
      )}
    </div>
  );
}

export default function CustomTurfCalculator() {
  const elapsed = useFillTimer();
  const [widthText, setWidthText] = useState("2");
  const [lengthText, setLengthText] = useState("10");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Null while either box holds something we cannot price: nothing is shown
  // as a price and the request cannot be sent.
  const q = priceCustomTurf(
    parseTurfMetres(widthText, TURF_MAX_WIDTH_M),
    parseTurfMetres(lengthText, TURF_MAX_LENGTH_M)
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!q) return;
    setSending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const contact = {
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      company: String(form.get("company") ?? ""),
      location: String(form.get("location") ?? ""),
      // The size leads the notes: it is the one thing the ERP lines cannot say.
      notes: [`Size: ${turfSizeLabel(q)}.`, String(form.get("notes") ?? "").trim()]
        .filter(Boolean)
        .join(" "),
    };
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact,
          // Inc. GST, the same as every cart line sent here.
          items: [
            {
              id: 0,
              name: describeCustomTurf(q),
              sku: CUSTOM_TURF_CODE,
              qty: 1,
              price: q.totalIncGst,
              size: { widthM: q.widthM, lengthM: q.lengthM },
            },
          ],
          subtotal: q.totalIncGst,
          adClick: readAdClick(),
          ...guardValues(form, elapsed()),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong.");
      if (data.accepted) {
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
    <div id="custom-turf">
      <p className="text-sm text-ash">
        Any width and length you need, to the centimetre (up to {TURF_MAX_WIDTH_M}m wide and {TURF_MAX_LENGTH_M}m
        long). {aud.format(TURF_RATE_PER_M2_EX_GST)} per m² plus a once-off {aud.format(TURF_CUSTOM_FEE_EX_GST)} for
        design, print, cut and production (ex GST), rounded up to the nearest dollar.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <MetrePicker label="Width" text={widthText} max={TURF_MAX_WIDTH_M} onChange={setWidthText} />
        <MetrePicker label="Length" text={lengthText} max={TURF_MAX_LENGTH_M} onChange={setLengthText} />
      </div>

      {q ? (
        <>
          <dl className="mt-6 border border-line divide-y divide-line text-sm" aria-live="polite">
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-ash">Area</dt>
              <dd className="font-bold">{formatMetres(q.areaM2)} m²</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-ash">
                Turf ({formatMetres(q.areaM2)} m² × {aud.format(TURF_RATE_PER_M2_EX_GST)})
              </dt>
              <dd>{aud.format(q.turfExGst)}</dd>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-ash">Custom design, print, cut &amp; production</dt>
              <dd>{aud.format(q.customFeeExGst)}</dd>
            </div>
            {q.roundedUp && (
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-ash">Rounded up to the nearest dollar</dt>
                <dd>{aud.format(q.totalExGst - q.unroundedExGst)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-ash">GST</dt>
              <dd>{aud.format(q.gst)}</dd>
            </div>
            <div className="flex justify-between items-baseline gap-4 px-4 py-4 bg-carbon text-white">
              <dt className="font-mono text-xs tracking-widest uppercase">Total inc. GST</dt>
              <dd className="text-2xl font-bold">{aud.format(q.totalIncGst)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-ash">{aud.format(q.totalExGst)} ex GST. Freight is quoted separately.</p>
        </>
      ) : (
        <p className="mt-6 border border-line px-4 py-6 text-sm text-ash text-center" aria-live="polite">
          Enter a width and length to see your price.
        </p>
      )}

      <div className="mt-8">
        {done ? (
          <div className="border border-accent bg-accent/5 p-8 text-center">
            <p className="font-display uppercase tracking-wide text-lg">Thank you</p>
            <p className="mt-2 text-ash">
              We&apos;ve got your {q ? `${formatMetres(q.widthM)}m × ${formatMetres(q.lengthM)}m ` : ""}turf request and will be in touch to confirm your design
              and freight.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 relative">
            <p className="font-display uppercase tracking-wide text-lg">
              {q ? `Request this turf: ${formatMetres(q.widthM)}m × ${formatMetres(q.lengthM)}m` : "Request this turf"}
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
            <button type="submit" disabled={sending || !q} className="btn btn-accent w-full sm:w-auto disabled:opacity-60">
              {sending ? "Sending…" : q ? `Request quote: ${aud.format(q.totalIncGst)}` : "Enter a valid size"}{" "}
              <span aria-hidden>→</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
