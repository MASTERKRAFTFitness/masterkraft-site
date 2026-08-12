# Draft email to Paul (eFront) — move the WooCommerce store to a subdomain

Status: DRAFT for Michael to review and send. This is the single gate that
unblocks go-live (see `launch-checklist.md` section 0 and `go-live-runbook.md`
step 1). Nothing else in the cutover can finish until this lands.

---

**Subject:** MasterKraft site relaunch — one hosting change we need from you first

Hi Paul,

We are getting close to launching the new MasterKraft website. Before we can
point the domain at it, there is one change on your side that we need to line up,
and I wanted to explain it clearly so we can plan it together.

**The situation.** The new site does not hold its own product catalogue. It reads
products, prices and stock live from the existing WooCommerce store in real time.
So the WooCommerce store has to stay running and reachable, even after we switch
`masterkraft.com` over to the new site.

**The change we need.** Today the WooCommerce store lives at `masterkraft.com`
itself. We need it moved to a stable subdomain that is not the main domain, for
example:

- `shop.masterkraft.com`, or
- `cms.masterkraft.com`

Once it is on a subdomain, the new site will keep reading live data from there,
and we can safely repoint `masterkraft.com` to the new site without taking the
store's data offline.

**What "moved" means in practice:**

1. The WordPress/WooCommerce install is served from the subdomain (WordPress
   Address and Site URL updated accordingly).
2. It has a valid SSL certificate for that subdomain (https works).
3. The WooCommerce REST API is reachable there. As a concrete check, this should
   return data with our existing read key:
   `https://shop.masterkraft.com/wp-json/wc/v3/products`
4. The Unleashed sync continues to run against the store at its new address.

**At cutover (a separate, later step, no action needed yet):** we will point
`masterkraft.com` and `www.masterkraft.com` at the new site's host (Vercel), and
we will leave the `shop`/`cms` DNS record pointing at your WordPress server,
untouched. We would love your help with the DNS records on the day so we can
sequence it cleanly and keep a fast rollback available.

**What would help us most right now:**

- Which subdomain you would prefer (`shop.` or `cms.`), and roughly how long the
  move would take on your side.
- A quiet window that suits you for the actual move, so we can be on hand to
  verify the API is reachable immediately afterwards.

Happy to jump on a quick call if that is easier. Thanks Paul, this is the last
big piece before we can go live.

Best,
Michael

---

## Notes for Michael (not part of the email)

- The exact subdomain does not matter to us; `shop.` reads best for customers who
  might ever see it, `cms.` reads as clearly internal. Either works in the code
  (it is a single env var: `WC_STORE_URL`).
- After Paul confirms it is live, our side is fast: set
  `WC_STORE_URL=https://shop.masterkraft.com` in Vercel, redeploy, verify a
  product page still shows live prices, then continue the runbook.
- Verification one-liner once he says it is up:
  `curl -s -o /dev/null -w '%{http_code}\n' https://shop.masterkraft.com/wp-json/`
  (expect 200).
