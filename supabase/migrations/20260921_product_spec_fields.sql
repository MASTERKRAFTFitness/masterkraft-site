-- The spec table, alongside the prose it already sits next to on the page.
--
-- WHY HERE AND NOT IN UNLEASHED. 20260905_product_content.sql drew the line at
-- "Unleashed is the product database and stays that way", and listed Assembled
-- size, Colour, Material and Warranty as things it holds. It cannot, and the
-- reason is structural rather than a matter of someone finishing the job:
--
--   1. AttributeSet is READ-ONLY on the API. Products supports GET and POST
--      only, and AttributeSet appears in the GET response fields and NOT in the
--      POST request fields. The sole route in is the browser CSV import at
--      Inventory > Products > Import/Export > Product Attributes.
--   2. The API cannot read the values back per product either. All 1,648
--      products return `AttributeSet: null`, and Products/{guid}/Attributes is
--      a 404. So even a filled ERP could not feed the website.
--   3. An attribute value caps at 50 characters and the import ABORTS the whole
--      file on the first row over. 19 warranties are over — the multi-part ones
--      like the Functional Trainer's — and they are omitted from the import
--      rather than truncated, because a warranty cut at 50 characters states
--      cover that ends where it does not.
--   4. 69 products carrying copy have no ERP record at all. Nothing to attach
--      an attribute to.
--
-- The attribute import is still worth running for the warehouse and for anyone
-- reading the ERP directly. It just cannot be where the website reads from, and
-- a field the site cannot read is not a source of truth for the site.
--
-- THIS IS NOT THE DUPLICATION THAT NOTE WARNED ABOUT. The warning was about two
-- systems holding the same fact and drifting — a price in both places, where
-- one of them is wrong and the customer sees it. These seven values are the
-- PUBLISHED SPECIFICATION as the old store stated it: content, with an author
-- and an edit history, rendered on the page.
--
-- Net weight, Gross weight and Packing size are the ones to watch, because
-- erp_products carries weight_kg / width_cm / depth_cm / height_cm and those
-- look like the same numbers. They are not the same fact:
--
--   erp_products      the CARTON, operational, what freight is quoted against
--                     (lib/freight-server.ts), owned by the warehouse, one
--                     Weight field.
--   product_content   what the PAGE SAYS, which distinguishes net from gross —
--                     two numbers Unleashed has one field for — and states a
--                     packing size the ERP expresses as three axes in a
--                     different order.
--
-- Nothing reads these for freight and nothing should. If that ever changes,
-- change it to read erp_products, not to sync one into the other.
--
-- TEXT, NOT NUMERIC, deliberately. These are display strings carrying their
-- units and their punctuation exactly as the page renders them: "414 kg",
-- "L 2,070 × W 1,220 × H 2300 mm", "Tungsten (metallic silver gray)". Parsing
-- them into numbers here would throw away the only form anyone has agreed on,
-- and the render order is already fixed in lib/spec.ts, so it needs no column.
alter table product_content
  -- lib/spec.ts parseProductDetail resolves each of these from the discrete ACF
  -- field first and the legacy specification_text blob second. What lands here
  -- is the RESOLVED value — what a customer sees today — not the raw source.
  add column if not exists assembled_size text,
  add column if not exists colour         text,
  add column if not exists material       text,
  add column if not exists net_weight     text,
  add column if not exists gross_weight   text,
  add column if not exists packing_size   text,
  add column if not exists warranty       text;

comment on column product_content.assembled_size is
  'Published assembled size, e.g. "L 2,070 × W 1,220 × H 2300 mm". Display string. NOT the freight carton — that is erp_products.';

comment on column product_content.net_weight is
  'Published net weight, e.g. "414 kg". Distinct from gross_weight, which Unleashed has no second field for. NOT the freight weight — that is erp_products.weight_kg.';

comment on column product_content.gross_weight is
  'Published gross weight, e.g. "454 kg". See net_weight.';

comment on column product_content.packing_size is
  'Published packing size as the page states it. NOT the freight carton — erp_products holds that, in the ERP axis order. See lib/freight-server.ts.';

comment on column product_content.warranty is
  'Full warranty text, unabridged. The reason this is not an Unleashed attribute: 19 of these exceed the ERP''s 50-character attribute cap.';

-- "Which products still have no spec at all", which is the content gap the
-- punch list is worked from and the query this table will be asked most while
-- the gap is being closed.
create index if not exists product_content_no_spec_idx
  on product_content (erp_code)
  where assembled_size is null and warranty is null;
