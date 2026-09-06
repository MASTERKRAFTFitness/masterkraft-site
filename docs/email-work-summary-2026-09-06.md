# Work summary email — 6 September 2026

**Draft. Not sent.** No recipient set. Attach `reports/unshippable-products.xlsx`.

---

**Subject:** Website update — online freight quoting is live, and card checkout is open

Hi all,

A big update on the website. Short version: **customers can now get a real
delivery price at checkout and pay by card**, orders write straight into
Unleashed, and WooCommerce is almost entirely out of the picture.

## Freight is quoted live, from two carriers

The site now prices delivery from **Australia Post and Easyship at the same
time** and shows the customer the cheaper one. They win at opposite ends: Australia
Post charges a flat national rate on small parcels that nobody beats — 1kg to
Perth is $10.20 with them and $47.20 through Easyship — while Easyship is far
cheaper on heavier items and long distances. A 21kg carton to Perth is $149.45 on
Australia Post against $111.20 the other way.

**On why Easyship.** I got tired of waiting for the freight companies we
approached to come back to us. Rather than let the whole thing sit, I went with a
developer-forward platform we could integrate with ourselves, in a day, without
waiting on anybody. Easyship gives us live rates from TNT, Aramex, CouriersPlease,
Allied, Toll and others through one connection, and it will handle labels and
tracking when we want them.

It is not a final answer on bulky freight and I want to be straight about that.
Their pricing on large items is based on **volume, not weight**: a 43kg roll of
turf to Adelaide quoted $446, of which $248 was an oversize surcharge, because it
is charged as though it weighed 101kg. Across our bulky range, 38 of 107 products
bill on volume at an average of 1.4 times their real weight — a 16kg medicine ball
rack bills as 175kg, because racks are large, light and mostly air. We have
historically charged around $145 on that same lane.

So there is a live query with Easyship about their volumetric pricing, and it is
worth putting the same question to Northline. **In the meantime nothing can be
sold at a price we have not sanity-checked**: anything over $250 of freight goes
to the quote flow for a person to price, exactly as it does today.

## Card checkout is open, and orders go into Unleashed

WooCommerce no longer places orders. They are written directly into Unleashed as
sales orders against a new **MasterKraft Website** customer account, with the
buyer's details and the freight charge on the order.

This was more urgent than it looked. Card checkout went live in the morning while
the order path still pointed at a WooCommerce that has had no web address since
the August cutover — so a customer could have been charged with no order created.
That was found and fixed the same day, and a test order has been through the new
path end to end.

## What is now hidden, and the attached list

**We cannot quote freight without a weight and all three carton dimensions**, and
if one product in a basket is missing them the *entire* basket becomes unquotable
— not just that line. So an unmeasured product is not a gap in a listing, it is a
tripwire under every order it can join.

**33 products are affected and are attached as a spreadsheet.** They are hidden
from the site for now.

The good news is that it is a smaller job than 33 sounds:

- **3 need only a height** — including the C2 Rower and C2 Ski Erg
- **2 need only their dimensions**, 1 needs only a length
- 27 need a weight and all three dimensions

The rows needing one or two measurements are shaded green in the sheet. Entering
the values in Unleashed — Weight, and Width/Depth/Height — puts the product back
on the site automatically.

Worth knowing what is on that list: the **C2 Rower ($1,250)** and **C2 Ski Erg
($1,200)** are both there, and both need a single measurement. They are the
highest-value items we are currently not showing.

We also found a batch of products whose dimensions had been entered in
**millimetres in a centimetre field** — a 12-inch foam box recorded as 850 x 1000
x 305, which the system read as 259 cubic metres. Those are corrected and an
import file is ready for Unleashed. No measuring required, just the unit.

## Under the hood

- Product copy, images and URLs are out of WordPress and into our own database,
  so they can be edited without an engineer for the first time.
- The catalogue is now mirrored from Unleashed, which removes the last real
  dependency on the frozen WordPress export from 25 August.
- If a carrier stops responding, it now emails us instead of failing quietly. That
  paid for itself within minutes of going live.
- Two old WordPress addresses that were 404ing for real visitors — `/about` and
  `/sample-page` — now redirect properly.

## My availability

I will **not be working this Wednesday, nor the Monday and Tuesday of next week.**

Best,
Michael

---

## Before sending

- [ ] Set the recipients. Steve and Gaetana, based on `docs/email-steve-gaetana-update.md`?
- [ ] Attach `reports/unshippable-products.xlsx` (regenerate if the catalogue has
      changed — the list is derived, not typed).
- [ ] **Decide whether the 33 are actually hidden before saying so.**
      `HIDE_UNSHIPPABLE` is off in production right now, so the email currently
      claims something that is not yet true. Either set it, or soften that line to
      "will be hidden".
- [ ] The Easyship-versus-$145 comparison is honest but it is also our walk-away
      number. Fine internally; cut it if this goes wider.
- [ ] Check the days off are the ones you mean: Wednesday 9 September, and Monday
      14 / Tuesday 15 September.
