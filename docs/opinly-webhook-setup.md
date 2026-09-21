# Opinly webhook — finishing the blog publish path

Written 2026-09-21, the day `/blog` went live. The blog works; this closes the
last gap between "published in Opinly" and "visible on masterkraft.com".
Needs someone with Opinly admin. No code changes — `src/app/api/opinly/route.ts`
is already built, deployed and correct.

## What is actually missing

`OPINLY_WEBHOOK_SIGNING_SECRET` is unset in Vercel. Without it `/api/opinly`
answers 500 to every webhook Opinly sends, so nothing invalidates the cache and
the site falls back to the one-hour ISR backstop in `src/app/blog/[[...slug]]/page.tsx`.

The consequence is narrower than it sounds, and worth understanding before
treating this as urgent. A published post's **own page is correct immediately** —
it is not in the cache, so the first request renders it fresh. What lags is
anything that *lists* posts: the blog index, `/blog/rss.xml`, and the blog's
entries in `sitemap.xml`. Those are cached for an hour.

This was observed rather than reasoned about. On 21 September the Singapore post
was published from the API; `/blog/commercial-gym-equipment-in-singapore-…`
returned 200 and rendered, while `/blog` still said "No posts here yet" and the
RSS feed carried zero items.

## The three steps

Do them in one sitting. **The signing secret does not exist until the webhook is
created**, so there is no way to load the secret first — there is an unavoidable
window between step 1 and step 3 where the endpoint rejects deliveries. Keep it
short rather than trying to design it away.

1. **Create the webhook in Opinly.** Settings → Developers → add a new webhook.
   Endpoint `https://masterkraft.com/api/opinly`. Subscribe to
   `content.routes-changed` and nothing else — Opinly dual-emits the legacy
   `content.paths-invalidated` for the same change, and the route deliberately
   ignores it so the work is not done twice. Copy the `whsec_…` secret.
2. **Add the secret to Vercel.** Project `masterkraft-site` → Environment
   Variables → `OPINLY_WEBHOOK_SIGNING_SECRET`, Production. Secret: Vercel only,
   never the repo.
3. **Redeploy production.** The route reads the variable at request time, but a
   deployment carries the environment it was built with, so nothing takes effect
   until a new one goes out.

A post that publishes inside the window is not lost — Opinly retries failed
deliveries with backoff, so it lands once the redeploy is through. The queue
publishes at 01:00 UTC on 23, 26 and 29 September, then 2, 5 and 8 October.

## Verifying

Opinly's webhook screen lists deliveries with response codes:

| Code | Meaning |
| --- | --- |
| 200 | Working. |
| 500 | Secret missing, or the redeploy has not happened. Steps 2 and 3. |
| 400 | Signature mismatch — the value in Vercel is not the one Opinly signs with. |

End to end: publish or edit a post and watch `/blog`. Seconds means the webhook
is accepted. An hour means it is not, and the ISR backstop is carrying it.

## The part that is not written down here

**The webhook UI could not be found in the dashboard.** Opinly's docs say
Settings → Developers, but on the MasterKraft company that page renders only the
CDN namespace and API Keys, with a section stuck on "Loading…" across repeated
loads. Settings → Organization shows only General and Members.

Three possibilities, and whoever holds admin will know which:

- the section is admin-gated and hidden for the account that looked;
- that part of the page is failing to render and needs a retry;
- webhooks are not on this plan, making Opinly support the next step.

If it is the third, nothing further is needed: the hourly backstop is a working
state, not a broken one.

## Related

- `LAUNCH.md` — the `OPINLY_*` entries, including why `OPINLY_API_KEY` is a
  Team-Shared Vercel variable that `vercel env ls` does not list.
- `next.config.ts` — `OPINLY_CDN_NAMESPACE`, the value that gated `/blog` until
  21 September.
