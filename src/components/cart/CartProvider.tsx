"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = {
  id: number; // unique cart key (product id, or variation id for variants)
  productId: number; // WC parent/product id — for order line items
  variationId?: number; // set for variable products
  sku?: string; // Unleashed ProductCode — what the warehouse and the quote use
  slug: string;
  name: string;
  image?: string;
  price: number; // GST-inclusive unit price (0 = price on application)
  qty: number;
};

type CartContextType = {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (id: number, qty: number) => void;
  remove: (id: number) => void;
  clear: () => void;
  ready: boolean;
  /**
   * Lines dropped on load because they are no longer sold. Shown once, then
   * dismissed - the customer needs to know their basket changed under them, not
   * to be reminded of it on every page.
   */
  removed: string[];
  dismissRemoved: () => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  // Locked while a payment is in flight — the cart the customer is paying for
  // must not change under them (it's already priced into the PaymentIntent).
  locked: boolean;
  lock: () => void;
  unlock: () => void;
};

const CartContext = createContext<CartContextType | null>(null);
const STORAGE_KEY = "mk_cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [locked, setLocked] = useState(false);

  const [removed, setRemoved] = useState<string[]>([]);

  // Hydrate from localStorage.
  //
  // react-hooks/set-state-in-effect is disabled below, and it is a false
  // positive here rather than a shortcut. The cart lives in localStorage, which
  // the server cannot read, so the first render MUST be the empty cart or
  // hydration mismatches. Reading it in an effect and setting state is the only
  // correct order, and it is why `ready` exists at all.
  useEffect(() => {
    let restored: CartItem[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) restored = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    // A LINE WITH NO ERP CODE IS ALREADY DEAD, and it is dropped here without
    // asking the server anything.
    //
    // `sku` only became part of a cart line on 2026-09-02, so a basket saved
    // before that has lines carrying nothing but a WooCommerce id. Nothing can
    // be done with such a line: cart-eligibility refuses to charge for it,
    // freight cannot be quoted without the ERP code, and it cannot be written to
    // an Unleashed order. It also cannot be matched against the availability
    // check below, so left alone it would sit in the basket forever - the exact
    // failure this whole path exists to prevent.
    //
    // This does not need the network, so unlike the check below it does not fail
    // open. There is nothing to be uncertain about: no code, no line.
    const unusable = restored.filter((i) => !i.sku);
    const usable = restored.filter((i) => i.sku);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (usable.length > 0) setItems(usable);
    if (unusable.length > 0) setRemoved(unusable.map((i) => i.name));
    setReady(true);

    // THE CART OUTLIVES THE CATALOGUE. It is stored in this browser, so a
    // product added last week survives the product being retired, moved to a
    // portal brand, or hidden for want of a measured carton. Left alone, the
    // customer reaches a checkout they cannot complete for a line they can no
    // longer open to remove, and has to empty the whole basket to escape.
    const skus = usable.map((i) => i.sku).filter((s): s is string => !!s);
    if (skus.length === 0) return;

    let live = true;
    fetch("/api/cart/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skus }),
    })
      .then((r) => r.json())
      .then((d: { unavailable?: string[] }) => {
        const gone = new Set((d.unavailable ?? []).map((s) => s.toUpperCase()));
        if (!live || gone.size === 0) return;
        // Name them before dropping them, so the notice can say WHICH. Appended,
        // not assigned: any line already dropped for having no code must stay
        // named in the same notice.
        setRemoved((prev) => [
          ...prev,
          ...usable.filter((i) => i.sku && gone.has(i.sku.toUpperCase())).map((i) => i.name),
        ]);
        setItems((prev) => prev.filter((i) => i.sku && !gone.has(i.sku.toUpperCase())));
      })
      // Fails open: a basket must not be emptied by a network error.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Persist
  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const value = useMemo<CartContextType>(() => {
    const add: CartContextType["add"] = (item, qty = 1) => {
      if (locked) return;
      setItems((prev) => {
        const existing = prev.find((i) => i.id === item.id);
        if (existing) {
          return prev.map((i) => (i.id === item.id ? { ...i, qty: i.qty + qty } : i));
        }
        return [...prev, { ...item, qty }];
      });
      setDrawerOpen(true); // slide the mini-cart open on add
    };

    const setQty: CartContextType["setQty"] = (id, qty) => {
      if (locked) return;
      setItems((prev) =>
        qty <= 0
          ? prev.filter((i) => i.id !== id)
          : prev.map((i) => (i.id === id ? { ...i, qty } : i))
      );
    };

    const remove: CartContextType["remove"] = (id) => {
      if (locked) return;
      setItems((prev) => prev.filter((i) => i.id !== id));
    };

    // clear() is intentionally NOT lock-guarded — the post-payment success path
    // empties the cart while it's still locked.
    const clear = () => setItems([]);

    const count = items.reduce((n, i) => n + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

    return {
      items,
      count,
      subtotal,
      add,
      setQty,
      remove,
      clear,
      ready,
      removed,
      dismissRemoved: () => setRemoved([]),
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      locked,
      lock: () => setLocked(true),
      unlock: () => setLocked(false),
    };
  }, [items, ready, removed, drawerOpen, locked]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
