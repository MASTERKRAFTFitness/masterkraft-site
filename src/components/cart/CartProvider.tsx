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

  // Hydrate from localStorage
  useEffect(() => {
    let restored: CartItem[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) restored = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    if (restored.length > 0) setItems(restored);
    setReady(true);

    // THE CART OUTLIVES THE CATALOGUE. It is stored in this browser, so a
    // product added last week survives the product being retired, moved to a
    // portal brand, or hidden for want of a measured carton. Left alone, the
    // customer reaches a checkout they cannot complete for a line they can no
    // longer open to remove, and has to empty the whole basket to escape.
    const skus = restored.map((i) => i.sku).filter((s): s is string => !!s);
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
        // Name them before dropping them, so the notice can say WHICH.
        setRemoved(restored.filter((i) => i.sku && gone.has(i.sku.toUpperCase())).map((i) => i.name));
        setItems((prev) => prev.filter((i) => !i.sku || !gone.has(i.sku.toUpperCase())));
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
