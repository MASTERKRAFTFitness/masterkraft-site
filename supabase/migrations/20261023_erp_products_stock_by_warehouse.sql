-- Stock per warehouse on the mirror, for the partner portals.
--
-- The portals show catalogue stock by location (Melbourne, 1-2 weeks; China,
-- 6-8 weeks) and net one warehouse's shortfall against the others, so a single
-- total (`stock`, Melbourne only) is not enough. Until now they read Unleashed
-- /StockOnHand live, per warehouse, on every cold catalogue load (~3 pages at
-- ~6s each). The loader (lib/erp-mirror.ts) already pages StockOnHand hourly;
-- it now reads every current warehouse and keeps each one's figures here, so the
-- portals' catalogue reads Supabase only.
--
-- Shape: {"MELB WHS": {"onHand": n, "allocated": n, "available": n}, ...}, one
-- key per warehouse that holds a record for the product, VIRTUAL WHS included.
-- Null when no warehouse holds a record: the portals show that as "—", never 0.
--
-- stock_synced_at is when THIS column was last read, which is not synced_at: a
-- failed stock read leaves both columns as they were (the loader then sends
-- neither key) while the rest of the row refreshes. The portals stop showing
-- stock once it is older than their ceiling, rather than showing a stale figure
-- as current.
--
-- DISPLAY ONLY. Nothing gates an order on these numbers; payments that need a
-- live figure read Unleashed directly.

alter table erp_products
  add column if not exists stock_by_warehouse jsonb,
  add column if not exists stock_synced_at timestamptz;

comment on column erp_products.stock_by_warehouse is
  'Unleashed StockOnHand per warehouse: {"MELB WHS": {"onHand","allocated","available"}, ...}. Written by lib/erp-mirror.ts; null = no stock record. Read by the partner portals.';
comment on column erp_products.stock_synced_at is
  'When stock_by_warehouse was last read from Unleashed. Left as it was when a stock read fails.';
