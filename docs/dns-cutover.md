# DNS cutover: masterkraft.com to Vercel

**Michael does this in Netregistry.** Not Claude: it is a registrar login and an
irreversible change to a live business domain.

Captured 2026-08-26 21:19 UTC. Re-check against reality before acting; if any
"before" value below does not match what Netregistry shows, stop and find out why.

---

## Read this first: do NOT change the nameservers

Vercel's dashboard will suggest delegating the domain by pointing the nameservers
at `ns1.vercel-dns.com` / `ns2.vercel-dns.com`. **Do not do that.**

`masterkraft.com` carries the company's Microsoft 365 email:

```
MX   0  masterkraft-com.mail.protection.outlook.com
TXT     v=spf1 include:spf.protection.outlook.com a -all
TXT     MS=ms57628921
```

Delegating nameservers to Vercel moves ALL DNS for the domain, and those records
do not come with it. Mail stops. Not "degrades", stops.

**Keep the Netregistry nameservers and change two records.** That is all this
needs, and it leaves email untouched.

---

## Rollback snapshot: what exists today

If anything goes wrong, restoring these two values puts the old site back.

| Record | Type | Current value |
|---|---|---|
| `masterkraft.com` | A | `103.26.237.235` |
| `www.masterkraft.com` | A | `103.26.237.235` |

Leave everything else exactly as it is:

| Record | Type | Value | Note |
|---|---|---|---|
| `masterkraft.com` | MX | `masterkraft-com.mail.protection.outlook.com` (pri 0) | **Email. Do not touch.** |
| `masterkraft.com` | TXT | `v=spf1 include:spf.protection.outlook.com a -all` | **Email. Do not touch.** |
| `masterkraft.com` | TXT | `MS=ms57628921` | Microsoft verification. Do not touch. |
| `masterkraft.com` | NS | `ns1/ns2/ns3.netregistry.net` | **Do not touch.** |
| `web.test.masterkraft.com` | CNAME | `cname.vercel-dns.com` | Existing staging. Leave. |

`shop.`, `cms.` and `staging.` do not currently exist.

---

## The change

Two records, in Netregistry's DNS editor for `masterkraft.com`.

| Record | Type | Change to |
|---|---|---|
| `@` (apex) | A | `76.76.21.21` |
| `www` | CNAME | `cname.vercel-dns.com` |

> **Confirm both values in the Vercel dashboard before typing them.** Add
> `masterkraft.com` to the `masterkraft-site` project first; Vercel then shows the
> exact records it wants for that domain. The apex A record above is Vercel's
> standard value, but read it off their screen rather than trusting this file.

Some registrars will not accept a CNAME on the apex. That is why the apex uses an
A record and only `www` uses a CNAME.

---

## Before you change anything

- [ ] `masterkraft.com` and `www.masterkraft.com` added as domains on the
      **masterkraft-site** project in Vercel (not just the account). Until this is
      done, Vercel will not serve the domain and you will get a 404 after the DNS
      propagates.
- [ ] `NEXT_PUBLIC_SITE_URL=https://masterkraft.com` set in Vercel Production.
- [ ] `NEXT_PUBLIC_ALLOW_INDEX=true` set in Vercel Production. Without it the new
      site goes live with `Disallow: /` and is invisible to Google.
- [ ] `NEXT_PUBLIC_CHECKOUT_MODE=quote` set, **unless** the WooCommerce store has
      already moved to a subdomain. The buy path reads the live store, so without
      this a customer fills in a card form and it fails at the last step.
- [ ] Redeployed after setting those, and verified on the `.vercel.app` URL.
- [ ] Note the TTL on the current A records. That is roughly how long a rollback
      takes to take effect.

## After

- [ ] `https://masterkraft.com` serves the new site, padlock valid.
- [ ] `https://www.masterkraft.com` serves or redirects correctly.
- [ ] `https://masterkraft.com/robots.txt` no longer says `Disallow: /`.
- [ ] **Send yourself an email from an outside address.** The whole point of not
      touching the nameservers is that mail keeps working, so prove it rather
      than assume it.
- [ ] A product page shows live prices.
- [ ] The quote form submits and the email arrives.

## Rollback

Set the apex A and `www` A records back to `103.26.237.235`. Nothing else changed,
so nothing else needs undoing. Allow one TTL.
