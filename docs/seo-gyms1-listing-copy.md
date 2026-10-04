# Gyms1 listing copy — MasterKraft

**Status: DRAFTED HERE, NOT YET APPLIED.** The listing editor
(`account.gyms1.com/listing-editor/109160538696493`) is behind a login, so this
copy was written for the standard directory fields without seeing the form.
Paste each block into the matching field; where Gyms1 has a character limit,
use the shorter variant.

Every fact below is taken from the live site (sources in brackets) — no prices,
no invented figures, no STRONG reference, "fitout" as one word, Australian
English, per `docs/opinly-brand-voice.md`.

---

## 1. Business details (NAP — must match the website exactly)

Directory listings help SEO mainly as **citations**: Google cross-checks the
name, address and phone across the web. Any variation (e.g. "Masterkraft
Fitness", a different phone format) dilutes it. Use exactly:

| Field | Value |
| --- | --- |
| Business name | MasterKraft |
| Street address | 8/337-339 Settlement Rd |
| Suburb / City | Thomastown |
| State | VIC |
| Postcode | 3074 |
| Country | Australia |
| Phone | +61 3 9044 9575 |
| Email | hello@masterkraft.com |
| Website | https://masterkraft.com |
| Instagram | https://www.instagram.com/masterkraft.equipment/ |
| LinkedIn | https://www.linkedin.com/company/masterkraft-pty-ltd/ |
| Opening hours | *Confirm with the team — not published on the site* |

[address/phone: `src/lib/legal-content.ts:478`, `src/components/layout/Footer.tsx`]

## 2. Category

Gyms1 is a consumer gym directory, and MasterKraft is not a gym. Pick the
closest supplier category so the listing is not mistaken for a training venue:

1. **Primary:** Fitness Equipment Supplier / Gym Equipment Store
2. **Secondary (if allowed):** Gym Fitout / Commercial Gym Design, Sporting
   Goods Wholesaler

If the only options are gym types (CrossFit, Strength, Functional Training),
choose **Strength & Conditioning** or **Functional Training**: these match the
equipment range and the search terms we want.

## 3. Tagline / headline (≤ 60 characters)

> Commercial Gym Equipment & Complete Gym Fitouts

Alternatives:
- `Engineered for Fitness — Commercial Gym Equipment` (49)
- `Gym Fitouts & Commercial Fitness Equipment, Melbourne` (53)

## 4. Short description (≤ 160 characters)

> Commercial and home gym equipment, complete gym fitouts and wholesale supply.
> Designed, supplied and installed Australia-wide from Melbourne.

(147 characters)

## 5. Full description

### Long version (~260 words)

> **MasterKraft — Engineered for Fitness**
>
> MasterKraft designs, supplies and installs commercial gym equipment and
> complete gym fitouts for gym owners, franchise groups, personal training
> studios, clinics and corporate facilities. From our base in Thomastown,
> Melbourne, we deliver fitouts across Australia and into Asia: 229 sites
> fitted out across 12 countries.
>
> **Complete gym fitouts.** One team covers the whole floor: layout and
> design, strength and cardio equipment, rubber gym flooring, storage and
> installation. It arrives coordinated and on schedule, so you are not
> managing a handful of separate suppliers.
>
> **Commercial gym equipment.** Our range includes plate-loaded and
> pin-loaded strength machines, power racks and lifting platforms, benches,
> free weights, functional training gear, Concept2 cardio and commercial
> flooring. All of it is engineered for the punishment of a busy member floor.
>
> **Custom-branded equipment for franchise groups.** We produce
> custom-branded equipment for multi-site operators, including Fernwood
> Fitness clubs. REVL studios across Australia and Asia are delivered floor
> to ceiling by MasterKraft.
>
> **Service you can hold us to.** Every fitout comes with a 72-hour response
> and resolution SLA, in writing, plus one custom-branded portal for
> ordering, tracking and support across every site.
>
> **Finance and wholesale.** Flexible equipment finance and leasing options
> are available, with wholesale supply for trade buyers.
>
> Planning a new gym or a refit? Call +61 3 9044 9575 or request a fitout
> brief at masterkraft.com.

### Short version (~110 words, for tighter limits)

> MasterKraft designs, supplies and installs commercial gym equipment and
> complete gym fitouts for gyms, franchise groups, PT studios and corporate
> facilities: 229 sites fitted out across 12 countries. One team handles
> layout, strength and cardio equipment, gym flooring, storage and
> installation. We produce custom-branded equipment for franchise groups
> including Fernwood Fitness, and deliver REVL studios across Australia and
> Asia. Every fitout is backed by a written 72-hour response and resolution
> SLA. Equipment finance and wholesale supply available. Based in Thomastown,
> Melbourne, delivering Australia-wide. Call +61 3 9044 9575 or visit
> masterkraft.com.

[229 sites / 12 countries / 72hr SLA: `src/lib/usps.ts:38-42`; Fernwood, REVL:
`src/lib/locations.ts`, `src/lib/revl.ts`; finance: `src/lib/content-pages.ts`]

## 6. Services / amenities (tick or list)

- Commercial gym fitouts
- Gym design and layout
- Equipment supply and installation
- Strength equipment (plate-loaded, pin-loaded, racks, benches)
- Free weights and functional training equipment
- Cardio equipment (Concept2)
- Commercial gym flooring
- Gym storage
- Custom-branded equipment for franchise groups
- Equipment finance and leasing
- Wholesale / trade supply
- Home gym equipment
- Warranty and after-sales support

## 7. Keywords / tags (if the editor has a tags field)

commercial gym equipment, gym fitout, gym fitouts Melbourne, gym fitouts
Australia, commercial fitness equipment, gym equipment supplier, strength
equipment, gym flooring, franchise gym fitout, boutique gym fitout, home gym
equipment, gym equipment wholesale, power racks, Concept2

## 8. Service areas (if the editor allows multiple)

Melbourne, Sydney, Brisbane, Gold Coast, Sunshine Coast, Perth, Adelaide,
Canberra, Newcastle, Wollongong, Geelong, Hobart, Darwin, Central Coast — plus
Singapore, Malaysia, Vietnam and South Korea. (These match the city pages at
`/gym-fitouts/[city]`, so the directory and the site reinforce each other.)

## 9. FAQs (if Gyms1 supports them)

**Is MasterKraft a gym?**
No. MasterKraft is a commercial gym equipment supplier and fitout company. We
equip and fit out gyms, studios and facilities rather than offering memberships.

**Do you install the equipment?**
Yes. We design, supply and install complete fitouts, coordinated end to end by
our own team.

**Do you work with franchise groups?**
Yes. We produce custom-branded equipment for multi-site operators, with one
portal for ordering, tracking and support across every site.

**Can I finance gym equipment?**
Yes. We offer flexible business finance and leasing for fitness equipment.

## 10. Photos

Use real fitout photos rather than product cut-outs. Directories rank listings
with photos higher, and real installs show proof of work. Good candidates:
Fernwood Pakenham and REVL Collingwood. Name each file descriptively before
uploading (e.g. `masterkraft-gym-fitout-fernwood-pakenham.jpg`).

---

## Before you invest time in Gyms1

Third-party site checkers (Trustpilot, ScamAdviser, Gridinsoft) give gyms1.com
low trust scores, and reviewers report that it lists businesses without asking.
Completing the free listing is fine: an accurate citation is better than a
scraped, wrong one. But:

- **Don't pay** for any "premium" or "verified" upgrade. The SEO value of this
  directory is low.
- Don't hand over payment details or extra account access.
- Spend more of the effort on higher-value citations first: Google Business
  Profile, Bing Places, Apple Business Connect, Yellow Pages AU, True Local,
  Hotfrog AU, and the Fitness Australia supplier directory.
