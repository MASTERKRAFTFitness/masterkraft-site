# Analytics dashboard (/admin/analytics)

A SEMrush-style overview for Steve: organic clicks, keywords and positions from
Search Console, plus traffic, channels, key events and revenue from GA4. It sits
behind the admin login, and the code lives in `src/lib/google-reporting.ts`.

## Accounts

| What | Value |
|---|---|
| GA4 account | MASTERKRAFT (412066861) |
| GA4 property | MAsterKraft Website, property ID **559036859** |
| Measurement ID (browser tag) | **G-HNLFD90XBN**, replacing G-86MEH5QL99 from 2026-10-15 |
| Search Console | Domain property `sc-domain:masterkraft.com` (DNS-verified), linked to the GA4 web stream |

The old ID, G-86MEH5QL99, belongs to a property that Michael's Google login
can't see. Its August–October history stays there. If you get access to it
later, it won't change anything here.

## Env vars

```
NEXT_PUBLIC_GA_ID=G-HNLFD90XBN          # browser tag (already used by CookieConsent)
GA4_PROPERTY_ID=559036859               # numeric property ID, NOT the G- ID
GOOGLE_SERVICE_ACCOUNT_JSON={...}       # the whole key file, verbatim, one line
GSC_SITE_URL=sc-domain:masterkraft.com  # optional, this is the default
```

With these unset, the page shows a setup notice instead of an error.

## Service account setup (one-off, about five minutes)

1. Go to console.cloud.google.com → create (or pick) a project → **APIs & Services → Enable APIs**.
   Enable **Google Analytics Data API** and **Google Search Console API**.
2. Go to **IAM & Admin → Service accounts → Create**, name it `masterkraft-reporting`. No roles are needed.
3. Open the account → **Keys → Add key → JSON**. A key file downloads.
4. Give the service account read access to the data:
   - GA4: Admin → Property access management → add the service account email as **Viewer**.
   - Search Console: Settings → Users and permissions → add the email as **Restricted**.
5. Put the key in the env:
   ```
   vercel env add GOOGLE_SERVICE_ACCOUNT_JSON production --scope masterkraft < key.json
   ```
   Paste the same JSON on one line into `.env.local` as `GOOGLE_SERVICE_ACCOUNT_JSON='…'`,
   then delete the downloaded file.

## What's not here (yet)

SEMrush's backlinks and authority score come from its own crawler, not
Google. Opinly (already integrated for the funnel) has backlink and
referring-domain data and is the natural source if Steve wants that panel.
