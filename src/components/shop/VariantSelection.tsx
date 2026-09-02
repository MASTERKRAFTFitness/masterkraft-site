"use client";

// Shares the selected size between the three controls that can change it — the
// dropdown, the thumbnail strip and the size table — which sit in different
// columns and rows of a server-rendered grid. A provider around the whole
// section is the cheapest way to connect them without lifting the page's static
// copy into a client component.
//
// THE PICKER OWNS THE SELECTION. The strip and the table own nothing; they ASK,
// by ERP code, and the picker answers by moving `code` and `imageSrc`. One
// owner and two askers is what keeps three controls from fighting over one
// value, and it is why a click settles in a single pass.
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Selection = {
  /** ERP code of the picked size, so any control can show which row is live. */
  code?: string;
  /** The picked size's photograph. */
  imageSrc?: string;
  /** Both written by the picker, together, so they cannot disagree. */
  setSelected: (code?: string, src?: string) => void;
  /**
   * A size some other control asked for, by ERP code.
   *
   * IT CARRIES A COUNTER because the same size can be asked for twice: click
   * 9kg in the strip, choose 12kg in the dropdown, click 9kg again. With the
   * code alone the second ask sets state to the value it already held, React
   * skips the render, and the control goes dead.
   */
  request?: { code: string; n: number };
  requestSize: (code: string) => void;
};

const Ctx = createContext<Selection | null>(null);

export function VariantSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSel] = useState<{ code?: string; src?: string }>({});
  const [request, setRequest] = useState<{ code: string; n: number } | undefined>(undefined);
  const setSelected = useCallback((code?: string, src?: string) => setSel({ code, src }), []);
  const requestSize = useCallback(
    (code: string) => setRequest((r) => ({ code, n: (r?.n ?? 0) + 1 })),
    []
  );
  const value = useMemo(
    () => ({ code: selected.code, imageSrc: selected.src, setSelected, request, requestSize }),
    [selected, setSelected, request, requestSize]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Null outside a provider, so simple products render exactly as before. */
export function useVariantSelection(): Selection | null {
  return useContext(Ctx);
}
