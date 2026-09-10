"use client";

import { useEffect, useRef } from "react";
import { ELAPSED_FIELD, HONEYPOT_FIELD } from "@/lib/form-fields";

// The client half of the bot filter. See src/lib/form-guard.ts for what the
// server does with any of it, and why.

/**
 * A field no person can see, reach by keyboard, or hear read out - and that a
 * form-filler walking the DOM fills in anyway. Anything in it means the
 * submission was not typed by a human.
 *
 * Visually hidden the standard way rather than with `display: none`, because a
 * bot worth the name skips fields the browser reports as hidden. Absolutely
 * positioned, so it takes no part in the layout of the form it sits in - it can
 * go anywhere except first, where it would take the `space-y` exemption that
 * belongs to the first visible field.
 */
export function HoneypotField() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        margin: -1,
        padding: 0,
        border: 0,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap",
      }}
    >
      {/* Named and labelled to look worth filling in. */}
      <label htmlFor={`hp-${HONEYPOT_FIELD}`}>Website</label>
      <input
        id={`hp-${HONEYPOT_FIELD}`}
        type="text"
        name={HONEYPOT_FIELD}
        tabIndex={-1}
        autoComplete="off"
        defaultValue=""
      />
    </div>
  );
}

/**
 * How long the form has been on screen, in ms.
 *
 * Started in an effect rather than at render so the server and the client do not
 * disagree about the time and blow up hydration. Returns undefined until that
 * effect has run - the server treats a missing value as "no opinion", never as
 * evidence of a bot.
 *
 * This is a DURATION taken from one clock. A timestamp round-tripped through the
 * form would be at the mercy of the visitor's system clock, and a laptop three
 * hours out would lock a real customer out of the warranty form.
 */
export function useFillTimer(): () => number | undefined {
  const loadedAt = useRef(0);
  useEffect(() => {
    loadedAt.current = Date.now();
  }, []);
  return () => (loadedAt.current ? Date.now() - loadedAt.current : undefined);
}

/** The two values every guarded form adds to its request body. */
export function guardValues(form: FormData, elapsedMs: number | undefined) {
  return {
    [HONEYPOT_FIELD]: String(form.get(HONEYPOT_FIELD) ?? ""),
    [ELAPSED_FIELD]: elapsedMs,
  };
}
