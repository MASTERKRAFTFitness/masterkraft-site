"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { OPINLY_KEY, OPINLY_SRC } from "@/lib/opinly";
import { isLiveHost } from "@/lib/live-host";

/**
 * The Opinly pixel, on the public domain only - see lib/live-host.
 *
 * Decided in an effect because the server cannot know the browser's hostname,
 * and rendering from it directly would be a hydration mismatch. The cost is the
 * pixel starting one effect later than it did from the layout, which is still
 * well before any visitor can click anything.
 */
export default function OpinlyPixel() {
  const [live, setLive] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setLive(isLiveHost()), []);
  if (!live) return null;
  return <Script id="opinly-pixel" strategy="afterInteractive" src={OPINLY_SRC} data-key={OPINLY_KEY} />;
}
