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

**Registering the endpoint is not self-service.** Opinly has not exposed
webhooks on this account (see below), so step 1 is an email and steps 2 and 3
wait on the reply.

1. **Ask Opinly to register the endpoint.** Email support@opinly.ai with the
   endpoint `https://masterkraft.com/api/opinly`, subscribed to
   `content.routes-changed` and nothing else — Opinly dual-emits the legacy
   `content.paths-invalidated` for the same change, and the route deliberately
   ignores it so the work is not done twice. Ask them to confirm webhooks are
   available on the plan and to send the `whsec_…` signing secret.
2. **Add the secret to Vercel.** Project `masterkraft-site` → Environment
   Variables → `OPINLY_WEBHOOK_SIGNING_SECRET`, Production. Secret: Vercel only,
   never the repo.
3. **Redeploy production.** The route reads the variable at request time, but a
   deployment carries the environment it was built with, so nothing takes effect
   until a new one goes out.

Ask support to say when the endpoint goes active, and do steps 2 and 3 promptly
after. Between the endpoint existing and the redeploy landing the route answers
500 to every delivery; Opinly retries with backoff, so a post published in that
window still lands once the redeploy is through, but keep the gap short. The
queue publishes at 01:00 UTC on 23, 26 and 29 September, then 2, 5 and 8 October.

## Verifying

Opinly's webhook screen lists deliveries with response codes:

| Code | Meaning |
| --- | --- |
| 200 | Working. |
| 500 | Secret missing, or the redeploy has not happened. Steps 2 and 3. |
| 400 | Signature mismatch — the value in Vercel is not the one Opinly signs with. |

End to end: publish or edit a post and watch `/blog`. Seconds means the webhook
is accepted. An hour means it is not, and the ISR backstop is carrying it.

## Why step 1 is an email

This was an open question when the doc was first written. It is now answered:
**webhook registration is not available on this account**, so there is no page to
do it on. Three checks on 21 September, in order:

- The Developers page, fully loaded, shows only the CDN namespace and API Keys.
  No webhooks section, and nothing hidden behind the slow-loading panel that
  caused the first, wrong reading of that page.
- Opinly's own dashboard agent was asked to register the endpoint and replied
  that it cannot: *"I can't register webhooks or retrieve signing secrets —
  that's outside what I'm able to do here."*
- That agent then ran a help-centre lookup and concluded webhooks may not be on
  the current plan or may not be released yet, directing the request to
  support@opinly.ai with the endpoint URL and the `content.routes-changed`
  subscription.

So this is not a UI someone failed to find. Support is the route.

## One trap, already removed

The API Keys table held a key **named** `OPINLY_WEBHOOK_SIGNING_SECRET`, created
16 September. It was an ordinary Opinly API key wearing the environment
variable's name — not a signing secret. Pasting it into Vercel would have
produced a 400 on every delivery and read as a subtly broken integration rather
than a wrong value.

It was deleted on 21 September, after confirming against Vercel that the live key
is a different one. If a similarly named key reappears, it is still not the
secret: the signing secret is issued by Svix when an endpoint is registered, and
it begins `whsec_`.

## Related

- `LAUNCH.md` — the `OPINLY_*` entries, including why `OPINLY_API_KEY` is a
  Team-Shared Vercel variable that `vercel env ls` does not list.
- `next.config.ts` — `OPINLY_CDN_NAMESPACE`, the value that gated `/blog` until
  21 September.
