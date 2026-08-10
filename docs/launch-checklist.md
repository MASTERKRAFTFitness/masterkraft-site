# MasterKraft website — launch checklist

Status of the new Next.js site (`masterkraft-site`, staging at
`web.test.masterkraft.com`). The site is essentially built; what remains is keys,
sign-offs, and one hosting cutover. Owners in **bold**.

## 0. The critical path: backend/hosting cutover 🔴
The new site READS live products, prices and stock from `masterkraft.com`'s
WooCommerce + Unleashed. So `masterkraft.com` cannot simply point at the new
Vercel site, that would kill the API it depends on.
- [ ] **Paul/eFront + Michael:** move the existing WordPress/WooCommerce store to a
      subdomain (e.g. `shop.` or `cms.masterkraft.com`).
- [ ] **Claude:** repoint `WC_STORE_URL` at that subdomain.
This is the real gate on go-live; everything else is quick once decided.

## 1. Keys to switch on the shop (client-supplied)
- [x] **WooCommerce Read/Write key** set, `WC_WRITE_ENABLED=true` — verified by a
      real order created on staging (2026-08-10).
- [x] **Stripe keys (staging):** sandbox **test-mode** keys in Vercel, checkout
      verified end-to-end (2026-08-10).
      - ⚠️ Staging was briefly wired with **live** Stripe keys (`pk_live`), which
        would attempt real charges. Staging now runs **test-mode** keys from the
        MasterKraft sandbox. **Swap back to the live keys at go-live** (section 3).
- [x] **Checkout hardening done + verified** (2026-08-10): order idempotency,
      cart-lock/snapshot during payment, free-shipping/total guard, legible Stripe
      errors, post-payment confirmation-screen fix.
- [x] **Resend live (2026-08-10):** `RESEND_API_KEY` + `QUOTE_FROM_EMAIL`
      (`quotes@masterkraft.com`) + `QUOTE_TO_EMAIL` (`steve@masterkraft.com`) set on
      staging; verified a quote submission emails Steve (`email:"sent"`). Domain
      `masterkraft.com` verified in Resend (SPF/DKIM/MX; DMARC optional, still open).
- [ ] **Michael:** GA4 Measurement ID (`G-…`) → `NEXT_PUBLIC_GA_ID` (analytics,
      already consent-gated).

## 2. Client sign-offs / content
- [ ] **Michael/Steve:** confirm the ABN — live Terms says `62 623 086 064`; the
      `84 659 220 274` given earlier was removed. Which is correct?
- [ ] **Steve/Gaetana:** sign off legal + info copy (real T&Cs/privacy/warranty are
      pulled from the live site; a few info pages are placeholder-but-professional).
- [ ] **Steve/Gaetana:** confirm displayed pricing (RRP = regular_price x1.1 GST).
- [ ] **Michael:** real resource PDFs (some are request-links).
- [ ] **Michael:** business address; (nice-to-have) per-page social/OG images.
- [ ] **Michael:** add the production domain to the HubSpot Delivery form's allowed
      domains if inline embed is wanted (otherwise the CTA-to-hosted-form works).

## 3. Go-live flip (Claude runs, once the above land)
- [ ] **Swap Stripe back to live keys** (`pk_live` / `sk_live`) — staging runs on
      test keys (see section 1). Real payments won't work until this is done.
- [ ] Move WP store to subdomain + update `WC_STORE_URL` (see section 0).
- [ ] Set `NEXT_PUBLIC_SITE_URL` = real domain; flip `NEXT_PUBLIC_ALLOW_INDEX=true`
      (turns on indexing + real robots/sitemap; canonicals stop pointing at vercel.app).
- [ ] Point production domain DNS at Vercel via Web Central (coordinate with Paul).
- [ ] Final QA + a live checkout smoke test.

---

## Already done ✅ (2026-08-06)
- **Checkout verified end-to-end (2026-08-10)** on staging with Stripe **test** keys:
  PaymentIntent create → confirm (test card) → real WooCommerce order created
  (#490099). Confirms server repricing + amount check + WC write key.
- **GST double-count bug fixed + verified (2026-08-10):** the store adds 10% GST
  on top of submitted line totals, so sending our GST-inclusive price recorded an
  order total 10% high (charged $779 → order $856.90). Fix: submit ex-GST line
  prices; WC re-adds GST → order total equals the charge, with a correct GST line.
  Verified: order #490102 total $779.00 = charged $779.00 (GST $70.82). Caught by
  the total-match guard + the variable-product test.
- **Variable-product checkout verified (2026-08-10):** order #490101, variation SKU
  resolved correctly.
- **Checkout hardening shipped + verified (2026-08-10):** legible Stripe-error
  handling, order idempotency (PI-metadata guard, re-verified live: a repeat
  /api/order returned the same order #490100, no duplicate), cart-lock + cart
  snapshot during payment, free-shipping/total-match guard, and a fix for the
  post-payment "Order confirmed" screen unmounting when the cart cleared.
- Marketing + info/legal pages, the live shop, SEO (schema/canonicals/sitemap),
  cookie-gated GA4+HubSpot, forms wired to HubSpot.
- **Checkout hardening** (charged-amount display bug + fail-closed repricing).
- **QA fixes** (HTML-entity `&amp;` decoding, em-dashes removed).
- **Accessibility**: 3-shade AA pink system + tap targets across homepage AND the
  product/contact/error/404/city templates; contact form label. A11y ~89→~96.
- **Staging live** at `web.test.masterkraft.com` (noindex, all above deployed).
- **Pre-launch route sweep**: all 25 key routes 200, unknown URLs correctly 404.
- **Version control**: pushed to `MASTERKRAFTFitness/masterkraft-site` (main).
  First push needed `http.postBuffer` raised (HTTP 400 otherwise). Note: the
  website deploys via the Vercel CLI, not via git push.
