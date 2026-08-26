# Draft email to Paul (eFront) — give WooCommerce its own hostname back

Status: DRAFT for Michael to review and send.

**Rewritten 2026-08-27, after the cutover.** Every earlier version said "this is
the last thing before we go live". That is now wrong: the site went live on
`masterkraft.com` on 27 August without Paul, because only the buy path reads the
live store and the site launched in quote-only mode.

The ask has changed shape. WooCommerce is no longer competing for the hostname,
it has **lost** it. WordPress is still running on its server, but
`masterkraft.com/wp-admin` and `/wp-json` now answer from Vercel, so the store is
only reachable by IP. That makes this more urgent than it was yesterday, not less.

---

**Subject:** MasterKraft: WooCommerce needs its own hostname (we cut the site over yesterday)

Hi Paul,

An update and a request.

**The new site is live.** `https://masterkraft.com` now serves the new MasterKraft
website. We repointed the domain on 27 August. Email was deliberately left alone:
we kept your nameservers and changed only the A and CNAME records, and we have
confirmed mail is still flowing normally.

**Your WordPress install has not been touched.** It is running exactly as it was,
on the same server, with all its data. Nothing has been moved or deleted.

**But it no longer has a hostname.** Because `masterkraft.com` now points at the
new site, WooCommerce is only reachable by IP address. In practice:

- `masterkraft.com/wp-admin` no longer reaches WordPress.
- `masterkraft.com/wp-json/...` no longer reaches the WooCommerce API.
- Anything integrating with the store over that hostname will be failing,
  **including the Unleashed sync**, which is the one we would most like you to
  check.

**So the request is the same one as before, now with some urgency:** please give
the store its own subdomain, for example `shop.masterkraft.com` or
`cms.masterkraft.com`.

**What we need specifically.** We tested what the server does today, so this is a
short list rather than a vague ask:

1. **A vhost for the subdomain, pointing at the existing WordPress docroot.** A
   request with `Host: shop.masterkraft.com` currently reaches the server but
   `/wp-json/` returns 404, so WordPress is bound to the old vhost only.
2. **An SSL certificate covering the subdomain**, so https works there.
3. **Update any payment gateway or webhook callback URLs** registered against the
   old hostname.
4. **Check the Unleashed sync** and repoint it at the new address.

**Two things we can take off your plate:**

- **The WordPress Address / Site URL change** in wp-admin. We have backend access
  and can do that ourselves once 1 and 2 are in place. It has to be last: changed
  before the vhost exists, WordPress redirects everything to a hostname that does
  not answer.
- **The DNS record.** The domain is on Netregistry nameservers and we have access,
  so unless you would rather do it, tell us the value you want and we will create
  it.

**Could you come back to us on:**

- **Which subdomain you prefer** (`shop.` or `cms.`).
- **When you can do the vhost and certificate.** Sooner is better: until it is
  done, the store has no working hostname and its integrations are down.
- **Whether anything else on your side pointed at `masterkraft.com`** that we
  should expect to have broken.

Sorry to land this as a fait accompli. The cutover was brought forward, and the
new site does not depend on WooCommerce to display anything, so it could go ahead
without waiting. The store side is the part that now needs you.

Best,
Michael

---

## Notes for Michael (not part of the email)

- **The honest framing matters here.** We cut the domain over knowing this would
  happen. Better to say so than let Paul discover the store is unreachable and
  work out why.
- **Check the Unleashed sync today** rather than waiting on Paul. If it pushes to
  WooCommerce over `masterkraft.com`, it has been failing since the cutover.
  Orders taken before then are safe; the risk is anything that has tried since.
- **You can still reach wp-admin by IP** (`http://103.26.237.235/wp-admin/`),
  though the browser will warn about the certificate and WordPress may redirect
  you back to `masterkraft.com`. If it does, that is siteurl doing its job, and is
  another reason to get the subdomain in place.
- `WC_STORE_URL` in Vercel still says `https://masterkraft.com`, which now
  resolves to the new site. Harmless while `NEXT_PUBLIC_CHECKOUT_MODE=quote` is
  set, because nothing reads it. It must change the moment the store moves.
- **Still blocking card checkout independently of Paul:** Stripe is on test keys,
  confirmed 2026-08-27 from the deployed bundle.
- **Order of operations:** DNS record, then vhost, then certificate, then siteurl.
  Changing siteurl early is the one step that can lock you out of wp-admin.
