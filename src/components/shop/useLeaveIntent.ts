"use client";

// "Before you go": noticing that a shopper is about to leave the checkout, so
// the "Anything stopping you?" question can be put in front of them once,
// rather than sitting below the form where most people never scroll.
//
// DESKTOP ONLY, ONCE PER CHECKOUT. The signal is the pointer leaving the top of
// the window, towards the tabs, the address bar or the back button. Phones have
// no such signal (by the time the page is hidden they have already gone), so a
// touch screen is never asked, and nothing here blocks leaving: no beforeunload
// prompt, which browsers show as a scary "Leave site?" box. Once asked, the
// checkout id is remembered for the session so a second exit is left alone.
import { useCallback, useEffect, useState } from "react";

const ASKED_KEY = "mk-leave-asked";

function alreadyAsked(checkoutId: string): boolean {
  try {
    return sessionStorage.getItem(ASKED_KEY) === checkoutId;
  } catch {
    return false;
  }
}

function rememberAsked(checkoutId: string) {
  try {
    sessionStorage.setItem(ASKED_KEY, checkoutId);
  } catch {
    // Private mode and the like: at worst they are asked again if they come back and leave a second time.
  }
}

/**
 * True from the moment the shopper looks to be leaving until `dismiss` is
 * called. `enabled` should mean "worth asking": freight has been quoted and the
 * question has not been answered. Turning it off stops the watching but does
 * not close an open prompt, so an answer given in it can be thanked.
 */
export function useLeaveIntent(checkoutId: string, enabled: boolean): { leaving: boolean; dismiss: () => void } {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!enabled || alreadyAsked(checkoutId)) return;
    if (!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;
    // Not in the first few seconds after the freight price appears: that is
    // reading it, not leaving.
    const armedAt = Date.now() + 3000;
    function onOut(e: MouseEvent) {
      if (e.relatedTarget || e.clientY > 0 || Date.now() < armedAt) return;
      // Once only: stop listening, so closing the prompt and heading for the
      // tabs again lets them go.
      document.removeEventListener("mouseout", onOut);
      rememberAsked(checkoutId);
      setLeaving(true);
    }
    document.addEventListener("mouseout", onOut);
    return () => document.removeEventListener("mouseout", onOut);
  }, [checkoutId, enabled]);

  const dismiss = useCallback(() => setLeaving(false), []);
  return { leaving, dismiss };
}
