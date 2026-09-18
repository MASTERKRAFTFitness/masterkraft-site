-- The WooCommerce order history, kept because the server holding it is going.
--
-- WHY THIS EXISTS. 199 orders were placed through WooCommerce before the ERP
-- order path took over on 6 September. Unleashed has nothing before that date,
-- `lib/wc-admin.ts` — the only code that could read them — was deleted on
-- 18 September, and the box that holds them answers only on a pinned IP with a
-- certificate that expires 27 September and cannot renew. After that the
-- account is Paul's and nobody here controls when it is cancelled.
--
-- So this is the last copy, and it is taken under a deadline. That shapes the
-- design more than anything else below.
--
-- IT IS AN ARCHIVE, NOT A MODEL. Nothing writes here but the one-shot loader,
-- and nothing on the site reads it. Do not build a feature on this table. If
-- customer-facing order history is ever wanted, that is a decision to make
-- deliberately against the ERP, which is where orders have lived since 6 Sep —
-- not something to grow sideways out of a rescue dump. The `_archive` suffix is
-- there to make that awkward to forget.
--
-- `raw` IS THE POINT, AND THE COLUMNS ARE THE CONVENIENCE. Every typed column
-- below is a guess about what somebody will want to query in two years. `raw`
-- is the whole WooCommerce record exactly as the API returned it, so a guess I
-- got wrong costs a JSON path expression rather than the data itself. When the
-- source is about to disappear, completeness beats tidiness; there is no second
-- chance to re-import a field I failed to anticipate.
--
-- WHAT IT IS FOR, CONCRETELY: a customer rings in 2028 about a rack bought in
-- 2024 and wants to know what they paid, what was in the order, and whether it
-- was refunded. That is a query on one order number, which is why this is a
-- table and not a tarball of JSON in a bucket.
create table if not exists woo_orders_archive (
  -- The number the customer quotes, e.g. '490118'. TEXT, not an integer: it is
  -- an identifier that gets read down a phone, and WooCommerce's own `number`
  -- is a string that plugins are free to prefix. Sorting it numerically is not
  -- a thing anyone needs.
  order_number      text primary key,
  -- WooCommerce's internal post id, which is NOT the order number and is the
  -- key every other Woo record joins on. Kept so a future export from the
  -- cPanel backup can be matched against these rows.
  wc_id             integer,
  status            text,
  currency          text,
  total             numeric(12, 2),
  shipping_total    numeric(12, 2),
  date_created      timestamptz,
  date_paid         timestamptz,
  payment_method    text,
  payment_method_title text,
  -- The Stripe PaymentIntent. THE REASON THIS COLUMN IS PROMOTED OUT OF `raw`:
  -- it is the only join from a pre-September order to the money, and Stripe
  -- keeps its own records far longer than this server is going to exist. An
  -- order here plus a `pi_…` is a complete answer to "was this paid, and was it
  -- refunded" even after every other trace of WooCommerce is gone.
  transaction_id    text,
  customer_note     text,
  -- Name, address, email, phone. JSONB rather than flattened columns because
  -- the shape is WooCommerce's and re-deriving it later from columns I chose
  -- would be lossy in a way nobody would notice.
  billing           jsonb,
  shipping          jsonb,
  -- Ordered, as the order was placed: sku, name, quantity, totals.
  line_items        jsonb not null default '[]'::jsonb,
  -- The complete record, verbatim. See the note above.
  raw               jsonb not null,
  archived_at       timestamptz not null default now()
);

comment on table woo_orders_archive is
  'Frozen archive of the pre-2026-09-06 WooCommerce order history, rescued before the old host was lost. Read-only by intention: nothing on the site reads it and only the one-shot loader writes it.';

comment on column woo_orders_archive.raw is
  'The WooCommerce order exactly as the REST API returned it. The typed columns are a convenience over this, never a replacement for it.';

-- "What came in that month", for the one legitimate bulk question — reconciling
-- a period against Stripe or the accounts. Order-number lookup is the primary
-- key and needs nothing further.
create index if not exists woo_orders_archive_created_idx
  on woo_orders_archive (date_created desc);

-- Answering "which order is this Stripe payment?" from the other direction,
-- which is how a chargeback notice arrives: it names the payment, not the order.
create index if not exists woo_orders_archive_txn_idx
  on woo_orders_archive (transaction_id)
  where transaction_id is not null;

-- --------------------------------------------------------------------- RLS
--
-- Enabled with NO policies, which denies anon and authenticated outright and
-- leaves only the service role. Same pattern as product_content and
-- product_images, but here it is not a default anybody could relax casually:
-- every row is a named customer's home address, phone number and what they
-- spent. There is no version of this table a browser should ever reach.
alter table woo_orders_archive enable row level security;
