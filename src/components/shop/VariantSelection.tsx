"use client";

// Shares the selected variant between the picker and the gallery, which sit in
// two different columns of a server-rendered grid. A provider around the whole
// section is the cheapest way to connect them without lifting the page's static
// copy into a client component.
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Selection = {
  /** The photograph of the currently picked size. Written by the picker. */
  imageSrc?: string;
  setImageSrc: (src?: string) => void;
  /**
   * A thumbnail the shopper clicked. Written by the gallery, read by the picker,
   * which moves its selection to the size that owns that photograph.
   *
   * A CLICK IS A REQUEST, NOT A SECOND SOURCE OF TRUTH. The picker still owns
   * the selection; the gallery owns nothing and only asks. That is what keeps
   * the two from fighting, and it settles in one pass because the picker
   * answers by setting `imageSrc` to the src that was asked for.
   *
   * IT CARRIES A COUNTER because the same photograph can be asked for twice:
   * click 9kg, choose 12kg in the dropdown, click 9kg again. With the src alone
   * the second click sets state to the value it already held, React skips the
   * render, and the thumbnail stops working.
   */
  request?: { src: string; n: number };
  requestImage: (src: string) => void;
};

const Ctx = createContext<Selection | null>(null);

export function VariantSelectionProvider({ children }: { children: React.ReactNode }) {
  const [imageSrc, setSrc] = useState<string | undefined>(undefined);
  const [request, setRequest] = useState<{ src: string; n: number } | undefined>(undefined);
  const setImageSrc = useCallback((src?: string) => setSrc(src), []);
  const requestImage = useCallback(
    (src: string) => setRequest((r) => ({ src, n: (r?.n ?? 0) + 1 })),
    []
  );
  const value = useMemo(
    () => ({ imageSrc, setImageSrc, request, requestImage }),
    [imageSrc, setImageSrc, request, requestImage]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Null outside a provider, so simple products render exactly as before. */
export function useVariantSelection(): Selection | null {
  return useContext(Ctx);
}
