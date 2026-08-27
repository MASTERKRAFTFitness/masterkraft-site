# Moving WooCommerce off Paul's server

The website is already live on Vercel and does not need WooCommerce to display
anything. The store's remaining jobs are narrow: the REST API the checkout
reprices against, the order records, and the Unleashed sync.

Everything here is about moving those three things onto hosting we control.

## The numbers (measured 2026-08-27, old site)

| | |
|---|---|
| Uploads | **7.73 GB** |
| Database | **677.80 MB** |
| Core, plugins, themes | ~1.05 GB |
| **Total** | **9.42 GB** |
| Plugins installed | 18 |

New hosting: Webcentral cPanel, `s3352.syd1.stableserver.net`, `27.121.68.106`,
**29.3 GB disk, 1 GB PHP memory**, account `masterkr`.

## Two routes. Run both, take whichever lands first.

### Route A: Paul sends a full cPanel backup (preferred)

Requested in `email-paul-subdomain.md`. Restore it via **JetBackup 5** or
**Backup Wizard** on the new account.

Preferred because a backup carries what a plugin export cannot:

- `wp-config.php` constants, including API keys
- server level cron jobs
- `.htaccess` rules
- **the Unleashed sync credentials**

Those are exactly the things you would otherwise rediscover the hard way, weeks
later, when something silently stops syncing.

### Route B: self-service, no dependency on anyone

Slower and lossier, but starts today.

---

## Step 1: clean the database FIRST

**Do this before anything else.** 677 MB is very large for a store doing ~18
orders a month, and it is almost certainly junk rather than data. Cleaning first
makes every later step smaller, faster and more likely to succeed inside 1 GB of
PHP memory.

Log in via the hosts override (see below), then in the old wp-admin:

1. **WooCommerce → Status → Tools**
   - Clear customer sessions
   - Clear transients
   - Delete orphaned variations
   - Clear expired transients
2. **Tools → Scheduled Actions** — Action Scheduler logs are a classic cause of a
   bloated WooCommerce database. Delete completed and failed actions older than a
   month.
3. Install **WP-Optimize** or similar and clear post revisions, auto-drafts,
   trashed posts, spam comments, expired transients.
4. Re-check **Tools → Site Health → Info → Directory sizes** and note the new
   database figure.

A database like this often drops by half or more. If it does not, that is
informative in itself: it means the data is real and the migration is bigger than
it looks.

## Step 2: export WITHOUT the uploads

Use **WPvivid** or **Duplicator**, both free and both chunk properly. Do NOT use
All-in-One WP Migration: its free import cap is around 512 MB and the database
alone exceeds that.

Exclude `wp-content/uploads`. That is 7.73 GB serving nothing we still use: the
website renders product images from the 374 mirrored copies committed in
`public/product-images`, verified 2026-08-27 by checking the live pages, which
emit zero `masterkraft.com/wp-content/uploads` references.

The cost is broken thumbnails in wp-admin. Cosmetic, in a backend two people
look at. Move the uploads separately later if they turn out to matter.

## Step 3: import onto the new host

Into the WordPress already installed at `shop.masterkraft.com`. That install is a
landing pad; the import replaces it entirely.

## Step 4: fix the URLs

The database will be full of `masterkraft.com` references that must become
`shop.masterkraft.com`, or WordPress will redirect every request back to the live
website.

**WP-CLI is available on the new server**, so use it rather than a plugin:

```
wp search-replace 'https://masterkraft.com' 'https://shop.masterkraft.com' --all-tables --dry-run
```

Check the count, then run it without `--dry-run`.

## Step 5: prune the plugins

18 plugins, 371 MB, most of them serving a public website WordPress no longer
runs: Yoast Premium, WP Rocket, SeedProd, Mailchimp, WhatsApp, TablePress.

Keep WooCommerce, whatever runs the Unleashed sync, and the payment gateway.
Question everything else. Fewer plugins means fewer updates, fewer breakages and
a smaller attack surface on a box that now holds order data.

## Step 6: point the website at it

1. `WC_STORE_URL=https://shop.masterkraft.com` in Vercel Production
2. **Remove** `NEXT_PUBLIC_CHECKOUT_MODE`, which restores card checkout
3. Redeploy
4. Verify a product page prices correctly, then a real checkout

Card checkout also needs Stripe live keys, which is independent of all of this.

## Step 7: only then, decommission

Leave Paul's server running until the new one has proven itself for at least a
few days, including a real order and a successful Unleashed sync.

---

## Getting into the old wp-admin

`masterkraft.com` now points at Vercel, so the old WordPress is unreachable by
name. Override it on your own machine only:

```
sudo sh -c 'echo "103.26.237.235 masterkraft.com" >> /etc/hosts'
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```

Login is at **`https://masterkraft.com/wp-login.php?itsec-hb-token=cms`**. The
`itsec-hb-token` is required: iThemes Security hides the backend, and plain
`/wp-login.php` just redirects.

The old certificate is valid until **27 September 2026**, so https works with no
warning. After that it cannot renew, because renewal validates against a hostname
that now points at Vercel. **That is the real deadline on this whole exercise.**

**Remove the override when you finish**, or you will see the old site at
`masterkraft.com` and think the launch broke:

```
sudo sed -i '' '/103.26.237.235 masterkraft.com/d' /etc/hosts && sudo dscacheutil -flushcache
```

Chrome may need its own cache cleared at `chrome://net-internals/#dns`, and
Secure DNS turned off at `chrome://settings/security`, since DNS-over-HTTPS
bypasses the hosts file.

## What must not be lost

Check each of these exists on the new install before switching anything over:

- [ ] The Unleashed sync, with working credentials
- [ ] Payment gateway configuration
- [ ] Order history, complete
- [ ] Customer accounts
- [ ] Tax and shipping settings
- [ ] Any `wp-config.php` constants that are not standard
