-- is_branded: does the physical product carry a franchise's logo (Fernwood,
-- Snap, Jetts, Gold's, STRONG ...)? A brand-prefixed code is NOT enough: many
-- F/S/J/G/SP codes are plain MASTERKRAFT product sold under a brand code, and
-- only the photo or the product itself can settle it.
--
-- Three states on purpose: true = logo on it, false = checked, no logo,
-- null = not assessed yet. Don't default it to false, or "unchecked" and
-- "checked, unbranded" become indistinguishable.
--
-- Hand-set like `tags`, and survives the loader for the same reason: the
-- loader never sends the key, so the upsert leaves it alone. See
-- 20261001_erp_products_tags.sql for the trap.

alter table erp_products
  add column if not exists is_branded boolean;

comment on column erp_products.is_branded is
  'True when the product carries a franchise logo; false when checked and it does not; null when not assessed. Hand-set; the loader never writes it.';
