"use client";

import { useEffect } from "react";
import { trackViewItem } from "@/lib/analytics";

// Fires a GA4 `view_item` event once when a product page mounts. Rendered from
// the (server) product page. No-ops until analytics load (after consent).
export default function ViewItemTracker({
  id,
  name,
  price,
}: {
  id: number;
  name: string;
  price: number;
}) {
  useEffect(() => {
    trackViewItem({ id, name, price });
  }, [id, name, price]);

  return null;
}
