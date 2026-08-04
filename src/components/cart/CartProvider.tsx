"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = {
  id: number; // unique cart key (product id, or variation id for variants)
  productId: number; // WC parent/product id — for order line items
  variationId?: number; // set for variable products
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
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const CartContext = createContext<CartContextType | null>(null);
const STORAGE_KEY = "mk_cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  // Persist
  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const value = useMemo<CartContextType>(() => {
    const add: CartContextType["add"] = (item, qty = 1) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.id === item.id);
        if (existing) {
          return prev.map((i) => (i.id === item.id ? { ...i, qty: i.qty + qty } : i));
        }
        return [...prev, { ...item, qty }];
      });
      setDrawerOpen(true); // slide the mini-cart open on add
    };

    const setQty: CartContextType["setQty"] = (id, qty) =>
      setItems((prev) =>
        qty <= 0
          ? prev.filter((i) => i.id !== id)
          : prev.map((i) => (i.id === id ? { ...i, qty } : i))
      );

    const remove: CartContextType["remove"] = (id) =>
      setItems((prev) => prev.filter((i) => i.id !== id));

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
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    };
  }, [items, ready, drawerOpen]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
