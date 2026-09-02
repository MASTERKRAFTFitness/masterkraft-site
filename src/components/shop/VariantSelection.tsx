"use client";

// Shares the selected variant between the picker and the gallery, which sit in
// two different columns of a server-rendered grid. A provider around the whole
// section is the cheapest way to connect them without lifting the page's static
// copy into a client component.
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Selection = {
  imageSrc?: string;
  setImageSrc: (src?: string) => void;
};

const Ctx = createContext<Selection | null>(null);

export function VariantSelectionProvider({ children }: { children: React.ReactNode }) {
  const [imageSrc, setSrc] = useState<string | undefined>(undefined);
  const setImageSrc = useCallback((src?: string) => setSrc(src), []);
  const value = useMemo(() => ({ imageSrc, setImageSrc }), [imageSrc, setImageSrc]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Null outside a provider, so simple products render exactly as before. */
export function useVariantSelection(): Selection | null {
  return useContext(Ctx);
}
