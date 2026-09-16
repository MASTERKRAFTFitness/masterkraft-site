# Opinly brand voice — MasterKraft

**Status: DRAFTED HERE, NOT YET APPLIED.** The brand voice field lives in the
Opinly dashboard, not in this repo, and it can only be edited by someone signed
into the workspace. The text below is ready to paste into it. **Do that before
the queued posts are approved**, not after — see "Why this is urgent", then
"The queued posts" below for what is actually in the workspace (two drafts, held
for review) rather than what the handover said was.

## Why this is urgent

The same field on CareLocate carried an invented figure — "30,000+" — that no
one had supplied. It was not caught in a draft: it reached a published post
**seven times**, plus the meta description and the JSON-LD. Structured data and
a meta description are the two places a wrong number is hardest to walk back,
because they are what Google quotes rather than what a reader sees.

Generated copy will invent a number whenever a sentence wants one and the brief
does not forbid it. The fix is a standing instruction in the field itself, not a
per-post review.

## Paste this into the brand voice field

> **Never state a statistic, number, percentage, ranking, year count, customer
> count, or market-size figure that has not been explicitly supplied in the
> brief for this post.** If a sentence seems to need a number and none has been
> given, rewrite the sentence without one. This applies to body copy, headings,
> the meta description, and structured data equally — a figure invented for a
> meta description is the hardest kind to retract.
>
> **Never quote a price, a discount, a lead time, or a stock position.**
> MasterKraft's prices and availability come from Unleashed and change without
> notice; a number written into a blog post is stale the week after it is
> published and cannot be corrected from the ERP. Link to the product page
> instead — that page is repriced on every render.
>
> **Do not describe MasterKraft as partnered with, distributing, or representing
> STRONG.** Nothing about that relationship is live, and a published post that
> implies otherwise is a commitment made on the company's behalf.
>
> Australian English throughout: -ise endings, "kilogram", AUD. Write **fitout**
> as one word, never "fit-out" — it is the spelling used across the whole site.
>
> The audience is trade: gym owners, franchise groups, PTs fitting out a studio,
> and facility managers. Write to someone specifying equipment for a room full
> of paying members, not to someone buying a dumbbell for a spare bedroom.
> Concrete and specific beats enthusiastic. The brand line is "Engineered for
> Fitness"; the tone follows from it — engineering, not hype.

## One thing to confirm before pasting

The handover brief said to add "the accent is #F6EB1D, not red". **That
contradicts this codebase**, so it is deliberately left out of the text above
rather than guessed at.

`src/app/globals.css` defines `--color-accent: #ef5350` and the comment beside it
calls it "the exact brochure coral", with two further comments defending the
choice on contrast grounds. `#F6EB1D` (a yellow) appears nowhere in the repo, and
both brand logos in `public/brand/` are monochrome.

Both can be true — a print/brand palette can differ from a website's — but only
someone with the brand guidelines can say which applies to blog imagery. Add a
line to the field once that is settled, e.g. *"Brand accent for generated imagery
is #F6EB1D."* Writing a colour into the brand voice field that disagrees with the
site would be the same class of mistake as the invented statistic: an
unverified fact, stated confidently, in the place hardest to correct.

## The queued posts — read 2026-09-16 via the Opinly MCP

**Two posts, not three, and neither auto-publishes.** The handover said three
(Singapore / NZ / Australia) going live the moment the site can serve `/blog`.
What is actually in the workspace (`comp_4uxP45Rq6aqaL_5ceX8K3`):

| Post | Status | Scheduled |
| --- | --- | --- |
| Commercial Gym Equipment in Singapore: What Actually Determines Long-Term ROI | `scheduled_review` | 2026-09-18 |
| Commercial Gym Equipment Australia: How to Spec the Right Grade for Your Facility | `scheduled_review` | 2026-09-21 |

There is **no New Zealand post**. Both are `scheduled_review`, which in Opinly
means queued but held until a human approves — they will not publish on their
scheduled date on their own, and serving `/blog` does not release them. The
ordering pressure the handover described is therefore real but softer than
stated: approval is a gate, not a race.

### They do NOT have the CareLocate problem

Every company claim in both posts was checked against this repo and holds:

- **"229 sites across 12 countries"** — `src/lib/usps.ts:40`, `src/lib/locations.ts`,
  `src/app/contact/page.tsx:38`, `src/components/home/Hero.tsx:38`. A standing
  site-wide claim, not an invented figure.
- **"72-hour response and resolution SLA, in writing"** — `src/lib/usps.ts:41`,
  `src/app/contact/page.tsx:66`.
- **"REVL studio fit-outs in Singapore, Kuala Lumpur and Ho Chi Minh City"** —
  all three in `src/lib/revl.ts` (`revl-singapore` / REVL City Hall,
  `revl-kuala-lumpur`, `revl-ho-chi-minh-city`).
- **"Steve Callanan … Managing Director"** — `src/app/api/waitlist/route.ts:90`.
- **No prices, no stock positions, no STRONG reference** in either post.

So the statistics ban above is preventive here, not remedial. Keep it — it costs
nothing and the failure it prevents is expensive — but do not go into these two
drafts expecting to find a "30,000+".

### Two things found; one fixed, one still open

**1. One unsupported claim, in the Australia post.** It says the 72-hour SLA is
something MasterKraft "provides and documents in its warranty terms and
conditions". The SLA is real, but the warranty page does not carry the number:
`src/lib/content-pages.ts:25` says only "a committed response and resolution
SLA". The 72-hour figure lives on the process and support pages
(`content-pages.ts:201`, `:215`) and in the USP block. Either drop the clause
about where it is documented, or add the figure to the warranty copy. As written
it sends a reader to a document that does not contain what they were promised —
and `src/lib/legal-content.ts:775` has an unrelated "48-72 hours" for dispatch,
which is what they would find instead.

**2. ✅ FIXED 2026-09-16 — "fit-out" throughout, which this site stopped writing
that morning.** Commit `c1a2028` (16 Sep, 11:53) standardised on **fitout**, one
word, across the whole site — the tree is 327 "fitout" to 4 "fit-out". Both
drafts used "fit-out" in body copy, and so did the shared author bio.

Corrected via the Opinly MCP with targeted replacements (`edit_post` `edits`,
not a whole-body resend, so nothing else could drift):

- **Author bio** `auth_MQzUaks3hkWIud4pTJMD7` — 2 instances. This was the one
  that mattered most: the bio rides on every post this author ever publishes,
  so fixing it once fixes it forward.
- **Singapore post** — 17 instances, including four `##` headings.
- **Australia post** — 12 instances. Its existing "MasterKraft's gym fitouts
  across Australia" was already correct and was left alone.

Both re-read afterwards to confirm zero remain. **Neither post was approved or
published** — both are still `scheduled_review`, and the edits are saved to the
scheduled draft, which goes live only when the post does.

### Order of operations

1. Paste the brand voice text above. This is what stops the *next* post arriving
   with the same spelling — the fixes below are to the two drafts that exist,
   not to the generator that produced them.
2. ~~Fix the author bio's two "fit-out"s.~~ Done, 2026-09-16.
3. ~~Fix the "fit-out" instances in both drafts.~~ Done, 2026-09-16. **Still
   open:** the warranty-documentation clause in the Australia post (item 1
   above) — left alone deliberately, because it needs a decision rather than a
   substitution: either drop the clause or add the 72-hour figure to the
   warranty copy in `src/lib/content-pages.ts`.
4. Approve the two `scheduled_review` posts when you are happy with them.
5. Set `OPINLY_CDN_NAMESPACE` and redeploy (see `LAUNCH.md`) so `/blog` serves.

Steps 4 and 5 are independent — approval does not publish to a site that cannot
serve `/blog`, and serving `/blog` does not approve anything.
