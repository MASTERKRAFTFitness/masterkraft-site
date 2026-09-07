"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

/**
 * Embeds an official HubSpot form (region AP1) inline in the page, with a
 * guaranteed-working fallback to the hosted form.
 *
 * The form (Delivery Information) is a long operational intake with a
 * server-controlled "Site Name / Territory" dropdown, a file upload and ~15
 * conditional branches, so we don't rebuild it natively (no guessed option
 * values; conditional logic + upload handled by HubSpot).
 *
 * HubSpot renders it inside a cross-origin iframe that self-sizes only when
 * HubSpot allows inline rendering for the page's domain. On non-allowlisted
 * origins (e.g. localhost, or a production domain not yet added in HubSpot) the
 * iframe mounts but stays collapsed. We therefore treat "iframe reached a real
 * height" as the success signal; if it doesn't, we show a branded CTA to the
 * hosted form instead of a blank box.
 */

const PORTAL_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;
const RENDERED_MIN_HEIGHT = 150; // px; a real form is far taller
const PROBE_MS = 6000;

export default function HubspotForm({
  formId,
  hostedUrl,
}: {
  formId?: string;
  hostedUrl: string;
}) {
  // Whether the embed is possible at all is a property of the props, not
  // something to be discovered in an effect. Only the probe result is state.
  const configured = Boolean(PORTAL_ID && formId);
  const [probe, setProbe] = useState<"loading" | "embedded" | "fallback">("loading");
  const state = configured ? probe : "fallback";
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!configured) return;
    const el = ref.current;
    if (!el) return;

    const rendered = () => {
      const f = el.querySelector("iframe");
      return !!f && f.offsetHeight >= RENDERED_MIN_HEIGHT;
    };
    // Watch the iframe grow; HubSpot self-sizes it via postMessage when allowed.
    // No synchronous check first: ResizeObserver fires once on observe with the
    // element's current size, so an already-rendered iframe is caught below.
    const ro = new ResizeObserver(() => {
      if (rendered()) setProbe("embedded");
    });
    const mo = new MutationObserver(() => {
      const f = el.querySelector("iframe");
      if (f) ro.observe(f);
      if (rendered()) setProbe("embedded");
    });
    mo.observe(el, { childList: true, subtree: true });
    const existing = el.querySelector("iframe");
    if (existing) ro.observe(existing);

    const timer = setTimeout(() => {
      setProbe((s) => (s === "embedded" ? s : "fallback"));
    }, PROBE_MS);

    return () => {
      ro.disconnect();
      mo.disconnect();
      clearTimeout(timer);
    };
  }, [configured, formId]);

  return (
    <div className="mk-hsform">
      {configured && (
        <Script
          src={`https://js-ap1.hsforms.net/forms/embed/${PORTAL_ID}.js`}
          strategy="afterInteractive"
        />
      )}

      {state === "loading" && (
        <div className="animate-pulse space-y-4" aria-hidden>
          <div className="h-12 bg-cloud" />
          <div className="h-12 bg-cloud" />
          <div className="h-12 bg-cloud w-2/3" />
          <div className="h-32 bg-cloud" />
        </div>
      )}

      {state === "fallback" && (
        <div className="border border-line bg-cloud/40 p-8 sm:p-10 text-center">
          <h2 className="font-display text-2xl uppercase tracking-wide">Delivery Information Form</h2>
          <p className="mt-3 text-ash leading-relaxed max-w-md mx-auto">
            Open the secure delivery form to tell us about your site access and schedule your delivery.
            It takes about 10 minutes.
          </p>
          <a
            href={hostedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-accent mt-6"
          >
            Open the delivery form <span aria-hidden>→</span>
          </a>
          <p className="mt-5 text-sm text-ash">
            Prefer to talk it through? Call{" "}
            <a href="tel:+61390449575" className="underline decoration-accent-600 underline-offset-2">
              +61 3 9044 9575
            </a>
            .
          </p>
        </div>
      )}

      {/* Always mounted (except in fallback) so HubSpot can process AND size it.
          While loading it sits at 0px behind the skeleton; we detect the real
          height to flip to "embedded". display:none would stop it laying out,
          so we only remove it once we've committed to the fallback. */}
      {configured && state !== "fallback" && (
        <div
          ref={ref}
          className="hs-form-frame"
          data-region="ap1"
          data-form-id={formId}
          data-portal-id={PORTAL_ID}
        />
      )}
    </div>
  );
}
