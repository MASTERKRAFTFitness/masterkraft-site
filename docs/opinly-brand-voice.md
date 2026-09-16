# Opinly brand voice — MasterKraft

**Status: DRAFTED HERE, NOT YET APPLIED.** The brand voice field lives in the
Opinly dashboard, not in this repo, and it can only be edited by someone signed
into the workspace. The text below is ready to paste into it. **Do that before
the three queued posts publish**, not after — see "Why this is urgent".

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

## The three queued posts

Three posts are scheduled in the Opinly workspace — Singapore, New Zealand and
Australia, on commercial gym equipment — and they **go live the moment this site
can serve `/blog`**. That makes the order non-negotiable:

1. Paste the brand voice text above.
2. Read the three queued drafts and check them against it — in particular for
   invented figures, prices, and any STRONG reference.
3. Only then set `OPINLY_CDN_NAMESPACE` and redeploy (see `LAUNCH.md`).

Setting the namespace first publishes whatever those drafts currently say.
