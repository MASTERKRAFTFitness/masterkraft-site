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
- [ ] **Paul:** WooCommerce REST API key with **Read/Write** (we have read-only).
      → then **Claude:** set `WC_CONSUMER_KEY`/`SECRET`, flip `WC_WRITE_ENABLED=true`.
- [ ] **Steve/Gaetana/Paul:** Stripe keys (publishable + secret). Test-mode first
      for the staging trial. → **Michael** sets `STRIPE_SECRET_KEY` +
      `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in Vercel (financial secret, not Claude's
      to handle).
- [ ] **Michael:** Resend API key → `RESEND_API_KEY` (quote-request emails; forms
      already post to HubSpot).
- [ ] **Michael:** GA4 Measurement ID (`G-…`) → `NEXT_PUBLIC_GA_ID` (analytics,
      already consent-gated).
Once Stripe + write-WC land → **Claude:** verify checkout end-to-end + finish the 3
hardening items (order idempotency, cart-lock during payment, free-shipping-on-card).

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
- [ ] Move WP store to subdomain + update `WC_STORE_URL` (see section 0).
- [ ] Set `NEXT_PUBLIC_SITE_URL` = real domain; flip `NEXT_PUBLIC_ALLOW_INDEX=true`
      (turns on indexing + real robots/sitemap; canonicals stop pointing at vercel.app).
- [ ] Point production domain DNS at Vercel via Web Central (coordinate with Paul).
- [ ] Final QA + a live checkout smoke test.

---

## Already done ✅ (2026-08-06)
- Marketing + info/legal pages, the live shop, SEO (schema/canonicals/sitemap),
  cookie-gated GA4+HubSpot, forms wired to HubSpot.
- **Checkout hardening** (charged-amount display bug + fail-closed repricing).
- **QA fixes** (HTML-entity `&amp;` decoding, em-dashes removed).
- **Accessibility**: 3-shade AA pink system + tap targets across homepage AND the
  product/contact/error/404/city templates; contact form label. A11y ~89→~96.
- **Staging live** at `web.test.masterkraft.com` (noindex, all above deployed).
- **Pre-launch route sweep**: all 25 key routes 200, unknown URLs correctly 404.
- **Version control**: local git (16 commits); remote set to
  `MASTERKRAFTFitness/masterkraft-site` (push pending Michael's PAT).
