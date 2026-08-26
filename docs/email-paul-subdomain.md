# Draft email to Paul (eFront) — move the WooCommerce store to a subdomain

Status: DRAFT for Michael to review and send. This is the single gate that
unblocks go-live (see `launch-checklist.md` section 0 and `go-live-runbook.md`
step 1). Nothing else in the cutover can finish until this lands.

Revised 2026-08-27: the original said "getting close" with no date. Michael now
wants the cutover done, so this version asks for a specific commitment, points
Paul at the finished site so the request is concrete, and asks the DNS question
directly (see notes).

---

**Subject:** MasterKraft relaunch: the one hosting change we need from you to go live

Hi Paul,

The new MasterKraft website is finished and running. You can see it here:

**https://web.test.masterkraft.com**

That is the real site on its real hosting, reading live products, prices and
stock from your WooCommerce store. The only thing standing between it and
`masterkraft.com` is one change on your side, and I wanted to lay it out clearly
so we can get it scheduled.

**The situation.** The new site does not hold its own product catalogue. It reads
products, prices and stock live from the existing WooCommerce store in real time.
So WooCommerce has to stay running and reachable after we switch
`masterkraft.com` over to the new site. Right now both want the same hostname,
and they cannot both have it.

**The change we need.** Today the WooCommerce store is served from
`masterkraft.com` itself. We need it moved to a stable subdomain, for example:

- `shop.masterkraft.com`, or
- `cms.masterkraft.com`

Once it is on a subdomain, the new site keeps reading live data from there, and
we can repoint `masterkraft.com` at the new site without taking the store's data
offline for a moment.

**What "moved" means in practice:**

1. The WordPress/WooCommerce install is served from the subdomain (WordPress
   Address and Site URL updated accordingly).
2. It has a valid SSL certificate for that subdomain, so https works.
3. The WooCommerce REST API is reachable there. As a concrete check, this should
   return data with our existing read key:
   `https://shop.masterkraft.com/wp-json/wc/v3/products`
4. The Unleashed sync continues to run against the store at its new address.
5. Any payment gateway or webhook callback URLs registered against the old
   hostname are updated to the new one.

**At cutover (a separate, later step):** we point `masterkraft.com` and
`www.masterkraft.com` at the new site's host, and leave the `shop`/`cms` DNS
record pointing at your WordPress server, untouched. We would value your help
sequencing that on the day so we keep a fast rollback available.

**What we need from you:**

- **Which subdomain you prefer** (`shop.` or `cms.`).
- **A date you can do the move.** We are ready on our side and would like to go
  live this week if that is at all workable for you.
- **Who holds the DNS for masterkraft.com**, and how we request a record change.
  We have hit this before: a record we needed was requested and never created, so
  I would rather know the right route than guess.

Our side is quick once the store has moved: one configuration change, a redeploy,
and we verify a product page still shows live prices before anything else
happens. Call me if it is easier to talk it through.

Thanks Paul, this is the last big piece.

Best,
Michael

---

## Notes for Michael (not part of the email)

- **The DNS question is deliberate.** `staging.masterkraft.com` is configured as a
  domain in Vercel but has never resolved (NXDOMAIN), which means somebody
  requested a record and it was never created. If that is the normal failure mode
  here, the cutover will stall on it too. Worth pinning down before the day.
- The exact subdomain does not matter to us; `shop.` reads better to a customer
  who might ever see it, `cms.` reads as clearly internal. Either works in the
  code, it is a single env var: `WC_STORE_URL`.
- **Do not mention `masterkraft.com.au`.** It is listed in our Vercel account but
  its DNS points elsewhere and it currently serves a Brisbane kitchen and bathroom
  company. Separate question, not Paul's.
- After Paul confirms it is live, our side is: set
  `WC_STORE_URL=https://shop.masterkraft.com` in Vercel, redeploy, verify a
  product page still shows live prices, then continue the runbook.
- Verification one-liner once he says it is up:
  `curl -s -o /dev/null -w '%{http_code}\n' https://shop.masterkraft.com/wp-json/`
  (expect 200).
- **Still blocking independently of Paul:** Stripe is on test keys. Confirmed
  2026-08-27 by finding `pk_test` in the deployed JavaScript bundle. Real cards
  will be rejected until `sk_live_`/`pk_live_` are set in Vercel Production.
