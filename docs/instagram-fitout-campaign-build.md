# Instagram fitout campaign: Ads Manager build sheet

Prepared 6 October 2026. This is the click-by-click setup for the paid Instagram
campaign offering a free 3D fitout design. Settings are listed in the order Ads Manager
asks for them.

The ad copy (C1–C5, P1–P4, R1–R4, Reels RA–RD) was written in an earlier working
session and **is not in this repo**. Paste it into the ads as it was signed off. This
sheet only says which ad set each group goes in.

---

## 0. Before you spend anything

| # | Gate | Owner | Done |
|---|------|-------|------|
| 1 | Read Pixel Helper's warning on masterkraft.com and confirm it's harmless | Michael | ☐ |
| 2 | Submit a test brief from `https://masterkraft.com/fitout-solution?utm_source=instagram&utm_medium=paid_social&utm_campaign=fitout_3d&utm_content=TEST&fbclid=TEST`, then check the HubSpot message shows the source lines and "Meta". Delete the test contact and tell sales it was a test | Michael | ☐ |
| 3 | Delete the unused `NEXT_PUBLIC_META_PIXEL_ID` setting in Vercel. Assign yourself to the dataset in Events Manager | Michael | ☐ |
| 4 | Written permission from Fernwood before any ad names them | MasterKraft | ☐ |
| 5 | Confirm the rights to every project photo used in the ads | MasterKraft | ☐ |
| 6 | Agree who calls Instagram form leads **within the hour**, and in what hours | MasterKraft sales | ☐ |
| 7 | Create the HubSpot contact properties (section 2) **before** connecting lead ads | Michael | ☐ |

Old dataset `811669523670941` (probably the WooCommerce plugin) can wait. It matters
only for purchase-optimised campaigns, and this one optimises for leads.

---

## 1. Instant form (build once, used by 1a, 2a and 3)

Ads Manager → All tools → **Instant forms** (or create it inside ad set 1a's ad).

| Setting | Value |
|---|---|
| Form name | `MK – Fitout 3D – IG form v1` (HubSpot shows this name as the lead's source, so keep it exact) |
| Form type | **Higher intent** (adds a review screen. It means fewer junk leads, at the cost of slightly fewer submits) |
| Language | English (UK). Meta has no Australian English, and UK spelling matches |

**Intro**
- Headline: *Get a free 3D design of your gym fitout*
- Description: *Tell us about your space in five quick taps. Our design team turns it into a 3D layout, ready to price.*
  (If the earlier session's intro copy differs, that version wins.)

**Custom questions** use the same options as the website wizard (`src/lib/fitout-brief.ts`),
so form leads and website leads can be reported side by side. Every question is a
multiple choice.

| # | Question | Options (exact text) |
|---|---|---|
| Q1 | What are you fitting out? | Commercial Gym · Boutique Studio · Home Gym · PT Studio · Elite Sports · School or University |
| Q2 | Where is the project up to? | Ready to quote · Planning a build · Gathering concepts |
| Q3 | Would you like the equipment in your own colours? | I'd like custom branded · Standard finishes are fine · Not sure - show me both |
| Q4 | Rough budget for the equipment? | Under $10k · $10k - $50k · $50k - $150k · $150k+ · Not sure yet |
| Q5 | When do you need it in place? | As soon as possible · 1-3 months · 3-6 months · 6-12 months · Still exploring |

**Contact fields** (prefilled by Meta): Full name · Email · Phone number · Post code · Company name

**Privacy policy:** `https://masterkraft.com/privacy-policy`

**Thank-you screen**
- Headline: *Thanks, your brief is in*
- Description: *A MasterKraft designer will call you shortly. Got a floor plan or a phone photo of a sketch? Send it through and we'll start on the layout sooner.*
- Button: **View website** → `https://masterkraft.com/fitout-solution?utm_source=instagram&utm_medium=paid_social&utm_campaign=fitout_3d&utm_content=form_thankyou`

The order and wording of the questions follow brand rules: no prices, no lead times,
never "cheap", "fitout" as one word.

> **Which 5 questions?** The wizard asks more than five things (area, ceiling height,
> obstacles and zones as well). The five above are the ones that sort intent and
> budget. Area and zones get captured on the first call. If the earlier session picked a
> different five, use those, but keep the option text identical to the wizard.

---

## 2. HubSpot ↔ Meta lead sync

HubSpot drops answers to custom questions unless each one maps to a contact property.
Create these first in HubSpot → Settings → Properties → Contact, group "Fitout brief".
Make each one a **dropdown select**. For every option, the **internal value must be
the exact text from section 1**, including the plain hyphens in "$10k - $50k" and
"1-3 months". The website brief sends those exact strings too. A mismatch makes HubSpot
drop the website brief's properties (the brief itself still lands; see below).

| Property label | Internal name | Maps from |
|---|---|---|
| Fitout project type | `fitout_project_type` | Q1 |
| Fitout stage | `fitout_stage` | Q2 |
| Fitout branding | `fitout_branding` | Q3 |
| Fitout budget | `fitout_budget` | Q4 |
| Fitout timeline | `fitout_timeline` | Q5 |

Then go to HubSpot → Marketing → **Lead Capture → Lead Ads** → Connect account → Facebook
→ choose the MasterKraft Page and ad account → **Sync** `MK – Fitout 3D – IG form v1`:
- Map Full name, Email, Phone, Post code (→ Postal code) and Company name. Map Q1–Q5 to the properties above.
- Turn on **Create a contact** and send each new lead an internal notification (Lead Ads settings → notifications) to the person making the one-hour call.
- Optional: add a workflow "Contact property `fitout_stage` is any of Ready to quote, Planning a build" that creates a **call task, due in 1 hour**, for the sales owner.

**Qualified lead** = `fitout_stage` is Ready to quote or Planning a build **and**
`fitout_budget` is $10k - $50k, $50k - $150k or $150k+. Make this a HubSpot active list
called "Fitout 3D – Qualified". Its size is the number used in the week 3–4 review.

**The website brief fills the same five properties**, so the "Qualified" list counts
both paths. Until the properties exist, HubSpot refuses them. The site then resends the
brief without them, so no lead is lost, and the full brief is always in `message` as
well. Once the properties are created, check the next website brief shows all five
filled. If not, compare the dropdown internal values with section 1.

Test the sync with Meta's **Lead Ads Testing Tool**
(developers.facebook.com/tools/lead-ads-testing). Submit a test lead, confirm it lands
in HubSpot with all five properties filled, then delete it.

---

## 3. Campaign

| Setting | Value |
|---|---|
| Buying type | Auction |
| Objective | **Leads** |
| Campaign name | `MK_Fitout3D_IG_Leads_Oct26` |
| Special ad category | None |
| Advantage campaign budget | **Off** (budgets are set per ad set) |
| A/B test | Off. Lead form against website is compared on cost per qualified lead, not with Meta's split test |

---

## 4. Ad sets

Settings shared by all four ad sets:
- **Placements:** Manual → Instagram only: Feed, Profile feed, Explore, Explore home, Stories, Reels. Turn off Facebook, Messenger, Audience Network and Threads.
- **Location:** Australia (people living in). Narrow it only if sales can't cover a state.
- **Age:** 25–65+.
- **Schedule:** Start once all of section 0 is ticked. No end date. Review at weeks 3–4.
- **Ad set names** carry into `utm_term` on website clicks, so use them exactly as written.

### 1a: Commercial gyms, lead form (A$25/day)

| Setting | Value |
|---|---|
| Name | `1a_Commercial_Form` |
| Conversion location | **Instant forms** |
| Performance goal | Maximise number of leads |
| Budget | Daily A$25 |
| Audience | Detailed targeting (Advantage+ detailed targeting **off** to start): interests such as *Gym*, *Fitness centre*, *Personal trainer*, *Small business owners*, *Franchising*, plus behaviour *Small business owners*. Job titles where offered: Gym Owner, Gym Manager, Club Manager, Facility Manager |
| Exclusions | Custom audience "Fitout leads – submitted" (see section 5) |
| Ads | C1–C5 and the commercial Reels from RA–RD, each using form `MK – Fitout 3D – IG form v1` |

### 2a: PT studios and home gyms, lead form (A$20/day)

| Setting | Value |
|---|---|
| Name | `2a_PTHome_Form` |
| Conversion location | **Instant forms** |
| Performance goal | Maximise number of leads |
| Budget | Daily A$20 |
| Audience | Interests: *Personal trainer*, *Strength training*, *CrossFit*, *Weight training*, *Home gym*/*Exercise equipment*, *Powerlifting*. Exclude anyone already in 1a's job titles if Meta allows, otherwise accept the overlap |
| Exclusions | "Fitout leads – submitted" |
| Ads | P1–P4 and the PT/home Reels from RA–RD, same form |

Expect more "Under $10k" answers here. That's why qualification counts the budget band
rather than raw leads.

### 1b: Commercial gyms, website (A$20/day)

| Setting | Value |
|---|---|
| Name | `1b_Commercial_Web` |
| Conversion location | **Website** |
| Dataset / pixel | **517991158551582** |
| Conversion event | **Lead** |
| Performance goal | Maximise number of conversions |
| Attribution | 7-day click, 1-day view |
| Budget | Daily A$20 |
| Audience | **Identical to 1a.** That way the only thing that differs is the destination |
| Exclusions | "Fitout leads – submitted" |
| Ads | The same C1–C5 creative as 1a, CTA **Learn more** or **Get quote** |
| Website URL | `https://masterkraft.com/fitout-solution?utm_source=instagram&utm_medium=paid_social&utm_campaign=fitout_3d` |
| URL parameters (ad level, "Build a URL parameter") | `utm_content={{ad.name}}&utm_term={{adset.name}}` |

Meta adds `fbclid` itself. The site reads it and labels the brief "Meta" in HubSpot and
the internal email.

### 3: Retargeting (A$15/day)

| Setting | Value |
|---|---|
| Name | `3_Retarget_Form` |
| Conversion location | **Instant forms** (people who left the website wizard get the shorter path) |
| Performance goal | Maximise number of leads |
| Budget | Daily A$15 |
| Audience | Custom audiences (section 5): "Fitout site visitors 30d" **+** "IG engagers 60d" **+** "Form opened, not submitted 90d" |
| Exclusions | "Fitout leads – submitted" |
| Ads | R1–R4, same form |

If the retargeting pool is under about 1,000 people in week 1, Meta will barely deliver.
Drop the budget to A$10/day and move A$5 into 1a until the pool grows.

**Budget split:** A$80/day in total. The two form ad sets (A$45) against website 1b
(A$20) is roughly 70/30, before counting retargeting. Including retargeting, which also
uses the form, it's about 75/25. To hold the planned 60/40, move A$5/day from 1a to 1b.

---

## 5. Custom audiences (Ads Manager → Audiences)

| Name | Source | Rule |
|---|---|---|
| Fitout site visitors 30d | Website, pixel 517991158551582 | URL contains `fitout`, 30 days |
| IG engagers 60d | Instagram account | Everyone who engaged with this professional account, 60 days |
| Form opened, not submitted 90d | Instant form | People who opened but didn't submit, 90 days |
| Fitout leads – submitted | Instant form **and** website | Instant form "submitted" 180d, **OR** website event `Lead` 180d |

---

## 6. Ads: naming and checks

- Ad names equal the copy IDs: `C1`, `C2` … `R4`, `RA` …. They become `utm_content` on website clicks, so HubSpot shows which ad produced each brief.
- Identity: the MasterKraft Facebook Page plus the MasterKraft Instagram account.
- Before publishing each ad, check: "fitout" is one word, Australian spelling, no prices or lead times, never "cheap", Fernwood named only once item 4 is ticked, and every photo is cleared under item 5.
- Optional "Comment FITOUT" DM flow. Set it up in Meta Business Suite → Automations (or ManyChat) using the earlier session's DM sequence. Its link should use `utm_content=dm_fitout`.

---

## 7. Weeks 3–4 review

| Metric | Where it comes from |
|---|---|
| Spend per ad set | Ads Manager |
| Leads per ad set | Ads Manager (form) / HubSpot (website briefs with `utm_campaign=fitout_3d`) |
| **Cost per qualified lead** | Spend ÷ contacts in "Fitout 3D – Qualified" from that path |
| **Leads reaching a quote** | HubSpot deals created from those contacts |
| Speed to call | Time from contact created to first logged call (target under 1 hour) |

Decision rule: put the budget behind the path (form or website) with the lower **cost
per qualified lead that reaches a quote**, not the lower cost per raw lead. Pause any ad
with no qualified lead after about A$150 spend.
