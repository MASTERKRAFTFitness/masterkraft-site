# MasterKraft website — go-live runbook

The exact, ordered sequence to switch `masterkraft.com` over to the new site.
Written to be mechanical: do the steps in order, verify each before the next.
Status/ownership of the prerequisites lives in `launch-checklist.md`; this is the
cutover procedure once those are signed off.

**Roles:** *Paul/eFront* = WordPress host + DNS help. *Michael* = keys/secrets +
final card test. *Claude* = Vercel env + deploy + DNS records + verification.

---

## Preconditions (must all be true before starting)
- [ ] Steve/Gaetana content + legal sign-off done; ABN confirmed.
- [ ] Resend domain verified + `RESEND_API_KEY` + `QUOTE_FROM_EMAIL` set (quote email works on staging).
- [x] GA4 Measurement ID set (`NEXT_PUBLIC_GA_ID=G-86MEH5QL99`, Production, verified live 2026-08-12).
- [ ] Stripe **live** keys available (not yet installed — step 3).
- [ ] A maintenance window agreed (do it in a quiet trading period).

---

## The cutover (in order)

### 1. Paul: move the WooCommerce store to a subdomain
The new site READS products/prices/stock from WooCommerce, so the store must stay
live at a stable address that ISN'T `masterkraft.com`.
- [ ] Paul moves WP/WooCommerce to e.g. `shop.masterkraft.com` (or `cms.`).
- [ ] Confirm reachable: `https://shop.masterkraft.com/wp-json/wc/v3/products` responds
      (with our read key) and the Unleashed sync still runs against it.
- **Verify:** `curl -s -o /dev/null -w "%{http_code}" https://shop.masterkraft.com/wp-json/` → 200.

### 2. Claude: point the site at the store's new home
- [ ] Set `WC_STORE_URL=https://shop.masterkraft.com` in Vercel (Production).
- [ ] Redeploy. **Verify** a product page still shows live prices before continuing.
      (If prices vanish, the store URL/keys are wrong — stop and fix.)

### 3. Michael: install Stripe LIVE keys
- [ ] Replace the sandbox test keys with `sk_live_…` / `pk_live_…` in Vercel (Production).
- [ ] (Financial secret — Michael sets these, not Claude.)

### 4. Claude: flip the site to production identity
- [ ] `NEXT_PUBLIC_SITE_URL=https://masterkraft.com`
- [ ] `NEXT_PUBLIC_ALLOW_INDEX=true`  (turns ON indexing: real robots.txt + sitemap,
      canonicals stop pointing at the vercel.app/staging domain)
- [ ] Redeploy production. **Verify** on the vercel.app alias first:
      `curl -s https://<alias>/robots.txt` shows `Allow` (not `Disallow: /`), and a
      canonical tag points at `https://masterkraft.com`.

### 5. Claude + Paul: repoint DNS to Vercel
- [ ] Add `masterkraft.com` and `www.masterkraft.com` as domains on the Vercel project
      (`vercel domains add … masterkraft-site --scope masterkraft`).
- [ ] In Web Central DNS:
      - apex `masterkraft.com` → `A 76.76.21.21` (or ALIAS/ANAME → `cname.vercel-dns.com`)
      - `www` → `CNAME cname.vercel-dns.com`
      - **Leave the `shop`/`cms` record pointing at the current WP host** (do not touch it).
- [ ] If SSL stalls: `vercel certs issue masterkraft.com www.masterkraft.com --scope masterkraft`.
- **Note:** keep TTLs low beforehand if possible; propagation can take up to a few hours.

### 6. Claude: verify the live site
- [ ] `https://masterkraft.com` loads the new site, products priced from live data.
- [ ] `www` redirects/serves correctly; HTTPS valid (padlock).
- [ ] `robots.txt` = indexable; `/sitemap.xml` resolves with `masterkraft.com` URLs.
- [ ] Run the route sweep (see below) against the real domain.

### 7. Michael: live checkout smoke test (real money, then refund)
Live keys mean a test card is declined — this must be a real card.
- [ ] Buy one low-value item with a real card on `masterkraft.com`.
- [ ] Confirm the order appears in WooCommerce with correct line pricing.
- [ ] Confirm the confirmation screen + any email.
- [ ] **Refund** the order in Stripe + set the WC order accordingly.

### 8. Claude: quote + email smoke test
- [ ] Submit the quote form; confirm the Resend email lands and HubSpot receives it.

### 9. Post-launch
- [ ] Submit the sitemap in Google Search Console; confirm GA4 real-time sees traffic.
- [ ] Watch Vercel logs + Stripe dashboard for the first hours.

---

## Rollback (if something's wrong after DNS)
1. **Fastest:** revert the apex/`www` DNS records in Web Central back to the WP host —
   `masterkraft.com` returns to the old WordPress site. (Bounded by DNS TTL.)
2. Revert `WC_STORE_URL` if step 2 broke reads; redeploy.
3. Roll back to the previous Vercel deployment (Deployments → previous → Promote).
4. Stripe: if live keys misbehave, no orders complete (fail-safe) — investigate before retrying.

---

## Verification snippets
```bash
# Route sweep against the live domain
B=https://masterkraft.com
for r in / /all-equipment /equipment/strength /fitout /checkout /contact /sitemap.xml /robots.txt; do
  echo "$r -> $(curl -s -o /dev/null -w '%{http_code}' -L "$B$r")"
done

# Indexing gate flipped on?
curl -s https://masterkraft.com/robots.txt        # expect Allow, not Disallow: /

# Store still reachable at its subdomain (reads depend on this)
curl -s -o /dev/null -w '%{http_code}\n' https://shop.masterkraft.com/wp-json/
```
