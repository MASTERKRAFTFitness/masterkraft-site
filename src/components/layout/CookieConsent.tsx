"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";

const KEY = "mk_cookie_consent";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const HS_ID = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;
const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

export default function CookieConsent() {
  const [choice, setChoice] = useState<"accepted" | "declined" | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(KEY) as "accepted" | "declined" | null;
    setChoice(stored);
    setReady(true);
  }, []);

  const decide = (v: "accepted" | "declined") => {
    localStorage.setItem(KEY, v);
    setChoice(v);
  };

  return (
    <>
      {/* Analytics load only after explicit consent, and only if IDs are configured */}
      {ready && choice === "accepted" && (GA_ID || ADS_ID) && (
        <>
          {/* ONE gtag.js serves both properties — loading it twice would double
              every event. The src id only has to be one of them; what actually
              turns a property on is its own config line below. */}
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID || ADS_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());` +
              (GA_ID ? `gtag('config','${GA_ID}');` : "") +
              (ADS_ID ? `gtag('config','${ADS_ID}');` : "")}
          </Script>
        </>
      )}
      {ready && choice === "accepted" && HS_ID && (
        <Script id="hs-script-loader" strategy="afterInteractive" src={`https://js-ap1.hs-scripts.com/${HS_ID}.js`} />
      )}

      {ready && choice === null && (
        <div className="fixed inset-x-0 bottom-0 z-[60] bg-carbon text-white border-t border-white/15">
          <div className="container-mk py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
            <p className="text-sm text-white/70 leading-relaxed max-w-2xl">
              We use cookies to understand how our site is used and improve your experience. See our{" "}
              <Link href="/privacy-policy" className="underline decoration-accent-600 underline-offset-2">
                Privacy Policy
              </Link>
              .
            </p>
            <div className="flex gap-3 shrink-0">
              <button onClick={() => decide("declined")} className="btn btn-out !text-white text-xs">
                Decline
              </button>
              <button onClick={() => decide("accepted")} className="btn btn-accent text-xs">
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
