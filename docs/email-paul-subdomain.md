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

**Subject:** MasterKraft: bringing hosting in-house, and one urgent thing first

Hi Paul,

An update, a request, and something I want to be straight with you about.

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
- Anything integrating with the store over that hostname will be failing. That
  includes any stock or pricing sync, and the payment gateway callbacks
  (Stripe, Afterpay and Zip are all configured against it).

**The bigger picture, so the next bit is not a surprise.** Now that the website
runs on our own infrastructure, we would like to bring the hosting side in-house
too and hold the accounts directly. That is not a reflection on the service, it
is that we now have engineers working on this weekly and the round trip for every
change has become the bottleneck. We would like to work out a sensible handover
with you rather than anything abrupt, and we are happy to keep paying out any
notice or commitment we have.

**What would help most, and it is small: a full cPanel backup of the account.**
We have set up our own hosting and can restore it ourselves, which takes the store
off your hands entirely and is probably five minutes of your time.

A full backup also carries what a plugin export cannot: the wp-config constants,
server level cron jobs, .htaccess rules and the Unleashed sync credentials. Those
are the parts we would otherwise have to rediscover, so it is the cleanest
handover for both of us.

**If a backup is awkward, the alternative is giving the store its own subdomain**,
for example `shop.masterkraft.com`, so WooCommerce has a working hostname again
while we sort the longer term. It is about ten minutes in cPanel. We have established the server runs
cPanel and sits on CloudLoop infrastructure (`103.26.237.235`, reverse DNS
`cloudloop.com.au`). The steps are:

1. **Domains → Create A Domain**, `shop.masterkraft.com`, with **"Share document
   root" unticked** and the document root pointed at the *existing* WordPress
   folder rather than a new empty one.
2. **SSL/TLS Status → Run AutoSSL**, which issues the certificate for the
   subdomain.
3. **Update any payment gateway or webhook callback URLs** registered against the
   old hostname.
4. **Check the Unleashed sync** and repoint it at the new address.

We can handle the DNS record ourselves, and the WordPress Site URL change after.
Worth flagging that the Site URL is **hardcoded in `wp-config.php`**, not held in
the database, so it is three `define()` lines rather than a Settings change.

**Either way works for us:**

- **Send us the cPanel login** and we will do steps 1 and 2 today, or
- **You do them**, whichever is quicker for you.

If the hosting account is not yours directly, could you tell us who holds it? We
can approach them, we just do not know who to ask.

**There is a deadline, and it affects your side too.** The server currently holds
a Let's Encrypt certificate for `masterkraft.com` expiring **27 September 2026**.
It renews by HTTP validation against that hostname, which now resolves to the new
site, so **that renewal will start failing**. Getting the store onto its own
subdomain fixes that as a side effect, because the subdomain will resolve to your
server and AutoSSL can validate normally.

**Could you come back to us on:**

- **Which subdomain you prefer** (`shop.` or `cms.`).
- **Which you would prefer:** a full cPanel backup we restore ourselves (easiest
  for everyone), the cPanel login, or doing the subdomain work yourself.
- **Who holds the hosting account**, if it is not you. It appears to be CloudLoop
  but we do not know the arrangement.
- **When it can be done.** Sooner is better: until it is, the store has no working
  hostname and its integrations are down.
- **The Wbsync account.** We have worked out that the Unleashed sync runs through
  Wbsync, against a WooCommerce API key whose last successful call was 27 August
  at 09:12, which is when we repointed the domain. Who holds that account, and
  can it be transferred to us? Until it is repointed, orders are not reaching
  Unleashed.
- **The Bitbucket repository** `efront_au/masterkraft`, which holds the theme
  source and the deployment pipeline, and the pipeline's deployment variables and
  SSH keys. We had not appreciated the site was a custom build until we looked.
- **Whether anything else on your side pointed at `masterkraft.com`** that we
  should expect to have broken.

**What a handover would need to cover**, so we can scope it properly:

- **The cPanel account.** Is it yours, a reseller account, or MasterKraft's own
  account that you administer? That decides whether this is handing over a login
  or migrating an account.
- **The CloudLoop arrangement** and who is billed for it, so we can take that over
  cleanly rather than leaving you paying for our site.
- **Any plugin, theme or service licences** tied to your accounts rather than ours.
- **The Wbsync integration**: account ownership, billing, and its credentials.
- **The Bitbucket repo and its deployment pipeline**, including who has access.
- **Payment gateway configuration** on the WooCommerce side.
- **Backups**: what exists, where, and how far back.
- **Anything custom** you have built or patched that would not be obvious to
  someone reading the install cold.

We already hold the domain (Webcentral) and DNS, and we have WordPress admin, so
the gap is really the hosting account and the integrations around it.

Sorry to land the cutover as a fait accompli. The cutover was brought forward, and the
new site does not depend on WooCommerce to display anything, so it could go ahead
without waiting. The store side is the part that now needs you.

Best,
Michael

---

## Notes for Michael (not part of the email)

- **The backup request is the one to push for.** The site is 9.42GB (7.73GB of it
  uploads, 677MB database) and a plugin export cannot carry wp-config constants,
  cron jobs or .htaccess. A cPanel backup carries all of it. Everything else on
  this list is a workaround for not having one.

- **This is now a commercial email, not just a technical one.** Read the handover
  paragraph in your own voice before sending; the wording is deliberately
  non-accusatory ("not a reflection on the service") but you know the
  relationship and I do not.
- **The alternative was to ask for the cPanel login without mentioning the
  handover, and get it as a technical favour.** That would have worked and it
  would have been shabby. Saying it once, up front, is the version that survives
  him finding out later.
- **Consider whether this should be a call rather than an email.** A handover
  request landing cold in writing reads differently to the same thing said first
  and confirmed in writing after.
- **Do not let the handover conversation block the subdomain.** The store is
  unreachable now. If he stalls on the commercial side, the technical ask still
  stands on its own and is ten minutes of work.

- **The honest framing matters here.** We cut the domain over knowing this would
  happen. Better to say so than let Paul discover the store is unreachable and
  work out why.
- **There is no Unleashed integration inside WooCommerce.** Checked 28 August
  against the live store: the WooCommerce system status lists 52 active plugins
  and one inactive (FreightExchange), and not one of them is an Unleashed or ERP
  connector. Zero occurrences of "unleashed" anywhere in the system status. The
  only custom REST namespace, `masterkraft/v1`, is two theme helpers
  (`archive-products`, `archive-product-filters`).

  **The sync is real even so.** Michael confirmed on 4 August that web orders
  auto-flow into Unleashed, and numeric web order numbers were seen in Unleashed
  sitting beside the manual `SO-` wholesale ones. So it runs from **outside**
  WordPress: a middleware or an Unleashed-side connector, not a plugin. That is
  the sharper worry, not a milder one. Anything outside the server that polls the
  store almost certainly addresses it as `https://masterkraft.com/wp-json/...`,
  which has been answering from Vercel since 27 August. We just cannot prove it
  from here, which is exactly why the question is worth asking rather than
  asserting.
- **WP-Cron is enabled** (`wp_cron: true`), which means scheduled jobs fire on
  visitor page loads. The hostname no longer resolves to that server, so there is
  no visitor traffic and WP-Cron now effectively never runs. Anything scheduled,
  including WP All Import Pro's scheduled imports, has been dormant since the
  cutover unless a server-level cron calls `wp-cron.php` by path. We cannot see
  server cron over the API, which is one more reason to want the cPanel backup.
- **The store itself is alive and our credentials still work.** It only lost its
  DNS name, not its service. Reachable with a valid certificate by pinning the
  hostname to the old IP:

      curl --resolve www.masterkraft.com:443:103.26.237.235 \
        -u "$WC_CONSUMER_KEY:$WC_CONSUMER_SECRET" \
        https://www.masterkraft.com/wp-json/wc/v3/products?per_page=1

  Do not use plain `http://103.26.237.235` for anything authenticated: that sends
  the consumer key in the clear. The `--resolve` form validates properly, because
  the server's certificate covers `www.masterkraft.com`.
- **`Duplicator` v1.5.16.1 is installed and active.** If Paul stalls, and we have
  WordPress admin, that is a route to the full backup without him. It is a heavy
  job on a 9.42GB site and it writes to his server, so it is a decision, not a
  step to take quietly.
- **You can still reach wp-admin by IP** (`http://103.26.237.235/wp-admin/`),
  though the browser will warn about the certificate and WordPress may redirect
  you back to `masterkraft.com`. If it does, that is siteurl doing its job, and is
  another reason to get the subdomain in place.
- `WC_STORE_URL` in Vercel still says `https://masterkraft.com`, which now
  resolves to the new site. Harmless while `NEXT_PUBLIC_CHECKOUT_MODE=quote` is
  set, because nothing reads it. It must change the moment the store moves.
- **Still blocking card checkout independently of Paul:** Stripe is on test keys,
  confirmed 2026-08-27 from the deployed bundle.
- **Order of operations:** DNS record, then subdomain in cPanel, then AutoSSL,
  then siteurl. Changing siteurl early is the one step that can lock you out of
  wp-admin.
- **The hosting is NOT Webcentral.** Webcentral holds only the domain
  registration. The server is CloudLoop (`103.26.237.235`, cPanel on :2083), so
  there is no hosting product to find in the Webcentral console.
- **Try Reset Password on the cPanel login first.** If that account's contact
  address is a `@masterkraft.com` mailbox you can read, you are in without asking
  anyone.
