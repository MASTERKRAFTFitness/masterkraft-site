import type { NextConfig } from "next";
import { withOpinlyConfig } from "@opinly/next";
import legacyRedirects from "./src/data/legacy-redirects.json";

// The Opinly workspace's CDN namespace - a 21-character id, taken from the
// Next.js setup snippet in the Opinly dashboard. It is a public path segment,
// not a secret: it is the folder the blog's images are served from, and it ends
// up in the HTML of every post. Hence a literal here rather than an env var,
// the same as @opinly/next's own documented setup.
//
// UNSET IS A WORKING STATE, and a deliberate one. Empty means the wrapper below
// is skipped entirely, `opinlyConfig.blogPrefix` stays undefined, and
// lib/blog-route reads that as "the blog is not configured" and 404s /blog.
// Everything else on the site is untouched. The alternative - a placeholder
// namespace that satisfies the 21-character check - would build clean and serve
// a blog whose every image 404s from a CDN folder that does not exist, which is
// the failure you only find in Search Console six weeks later.
const OPINLY_CDN_NAMESPACE = process.env.OPINLY_CDN_NAMESPACE ?? "";

const nextConfig: NextConfig = {
  images: {
    // Every image the site serves now lives in /public (the 27 August mirror), and
    // all of it is already re-encoded at q88 by scripts/compress-assets.py - the
    // product shots average 71 KB. Routing that through Vercel's optimiser bought
    // us very little and cost us the whole quota: with the default deviceSizes /
    // imageSizes, ~900 source images fan out to ~14,000 transformations, and the
    // account's allowance is well under that. Once it was spent, every optimised
    // request returned 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED and the images
    // went blank sitewide, while the same files served fine at their /public path.
    // Serving them unoptimised is free, cannot run out, and keeps next/image's
    // lazy-loading and layout reservation. If this is ever turned back on, trim
    // deviceSizes first - each extra width is another billable transformation.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "masterkraft.com" },
      { protocol: "https", hostname: "www.masterkraft.com" },
      // Per-size range photography (2026-09-02). The /public mirror holds one
      // shot per PRODUCT, taken from WooCommerce parents; it has nothing for the
      // 258+ individual sizes, whose only photographs are the ERP's. Public,
      // no auth, ~100 KB each. Listed here so re-enabling the optimiser does not
      // silently blank every range page; mirroring these into /public the way
      // scripts/mirror-product-images.mjs did is the way to drop the dependency.
      { protocol: "https", hostname: "unlappcdn.unleashedsoftware.com" },
    ],
  },
  async redirects() {
    return [
      // WWW IS A SECOND COPY OF THE SITE, and until now it answered 200 on every
      // path. The apex is what the sitemap advertises, what robots.txt names and
      // what lib/site reports to Opinly — but nothing ever told a crawler that,
      // because no redirect existed and isIndexableHost (lib/site.ts) allows BOTH
      // hostnames on purpose, so www served a full, indexable, `Allow: /` copy.
      //
      // Most pages survived that on their canonical tag alone: www's copy of a
      // product or category page points at the apex, so Google folds it back.
      // The seventeen pages in this commit had no canonical at all, which left
      // www.masterkraft.com/our-story and masterkraft.com/our-story as two
      // indexable URLs of one page with nothing to separate them — and Google
      // picking the wrong one of a pair is exactly what the Search Console
      // notice of 2026-09-17 reports ("Duplicate, Google chose different
      // canonical than user").
      //
      // FIRST IN THE ARRAY, because redirects match in order and this one
      // normalises the host for every rule below it. Putting it last would send
      // www/shop to a relative /all-equipment that is still on www, and only
      // move it to the apex on the request after that.
      //
      // THE HOST IS MATCHED LITERALLY rather than by a /^www\./ pattern. The
      // same deployment answers on the vercel.app URL and on
      // web.test.masterkraft.com, which are NOISE, not duplicates: robots.txt
      // already noindexes them (isIndexableHost), and a broad rule would rewrite
      // a preview's own hostname out from under whoever is testing on it.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.masterkraft.com" }],
        destination: "https://masterkraft.com/:path*",
        permanent: true,
      },

      // WooCommerce used "packages-2"; storefront uses "packages"
      { source: "/equipment/packages-2", destination: "/equipment/packages", permanent: true },
      // Reformers was a category from 2026-08-27 to 2026-09-02 and never held a
      // product. The ERP files both reformers under Cardio, so that is where the
      // URL now goes rather than to a 404.
      { source: "/equipment/reformers", destination: "/equipment/cardio", permanent: true },
      // Common legacy entry points
      { source: "/shop", destination: "/all-equipment", permanent: true },
      { source: "/equipment", destination: "/all-equipment", permanent: true },
      { source: "/home", destination: "/", permanent: true },

      // FOUND BY THE 404 LOG, 2026-09-06 — the first thing it caught within
      // minutes of going live. Both are WordPress-era URLs that the outside
      // world still asks for: `/about` is the page every site is assumed to
      // have, and `/sample-page` is WordPress's own default, which means it was
      // published and indexed at some point. Neither was linked from here, so
      // neither was visible from inside the site — exactly the blind spot
      // src/lib/not-found-log.ts exists to cover.
      { source: "/about", destination: "/our-story", permanent: true },
      { source: "/sample-page", destination: "/", permanent: true },

      // THREE HOODIE URLS BECAME ONE, 2026-09-11, and both of the dead ones
      // point at the survivor rather than at each other.
      //
      // The ERP held one garment as two complete code series - MAACU02-S/M/L/XL
      // unpriced and MAACU02S/M/L/XL at $81.82 - plus a spelling, "Oversided
      // Hoodie (XL)", that differed from its own siblings and so grouped as a
      // third product: a one-size hoodie page, in the sitemap, served for
      // months. Correcting the spelling merged it into its range, and retiring
      // the unpriced series (Michael's rule: keep the priced record) left
      // /product/oversized-hoodie-unisex as the only one.
      //
      // Both sources are pointed straight at the survivor. Chaining
      // /oversided- -> /oversized- -> /oversized-hoodie-unisex would cost every
      // visitor a second round trip and dilute the signal across two hops.
      { source: "/product/oversided-hoodie", destination: "/product/oversized-hoodie-unisex", permanent: true },
      { source: "/product/oversized-hoodie", destination: "/product/oversized-hoodie-unisex", permanent: true },

      // FIVE MORE SLUGS MOVED BY FIXING ERP SPELLINGS, 2026-09-15. A product's
      // URL is derived from its ProductDescription, so correcting "Multi-sation"
      // to "Multi-station" in Unleashed renames the page as well as the heading.
      // All five old URLs were in the sitemap and served, so all five are
      // redirected rather than left to 404 - the same lesson the hoodie taught
      // four days earlier, applied before it could bite this time.
      { source: "/product/4-stack-multi-sation", destination: "/product/4-stack-multi-station", permanent: true },
      { source: "/product/5-stack-multi-sation", destination: "/product/5-stack-multi-station", permanent: true },
      { source: "/product/8-stack-multi-sation", destination: "/product/8-stack-multi-station", permanent: true },
      // NO REDIRECT FOR STATION MARKERS, deliberately. Renaming MBSADO03 moved
      // its slug from station-markets- to station-markers-, but BOTH answer 404
      // in production and always have: the product has no carton in
      // erp-cartons.json, and production runs HIDE_UNSHIPPABLE=true, so it is
      // filtered out of erpUnits before it can have a page at either name. A
      // redirect here would point one 404 at another and burn crawl budget
      // doing it. If a carton is ever recorded for MBSADO03 the product appears
      // at station-markers-set-of-20 on its own, and the authored copy is
      // already keyed to that slug waiting for it.
      {
        source: "/product/urethane-fixed-dumbbells-set-1-10kg-pairs-and-vertical-dummbell-rack",
        destination: "/product/urethane-fixed-dumbbells-set-1-10kg-pairs-and-vertical-dumbbell-rack",
        permanent: true,
      },

      // THE DUPLICATE MACHINES, retired 2026-09-15 by switching Sellable off
      // (Unleashed refuses Obsolete on a product with open transactions, and
      // the site excludes an unsellable product either way). Each points at the
      // record that survived it — Michael's rule: keep the priced one.
      //
      // /product/standing-hip-thrust is NOT here and must not be: MSLBPL28 was
      // only half of that page. MSLBSE07, the selectorised machine at
      // $3,427.27, still carries the name, so the URL still serves — and now
      // serves one machine instead of presenting two as size options of one.
      { source: "/product/multi-dead-lift", destination: "/product/multi-deadlift", permanent: true },
      { source: "/product/standing-hip-abductor", destination: "/product/standing-abductor", permanent: true },

      // BOTH HIP THRUST MACHINES WERE RENAMED with their loading mechanism on
      // 2026-09-15, which moved both slugs. MSLBPL04 was misspelled "Thurst" and
      // could not be corrected on its own: spelling it properly would have made
      // it read identically to MSLBSE07 and regrouped the two into a single
      // product page, which is the fault that retiring MSLBPL28 had just fixed.
      // Naming both by mechanism fixes the typo and the collision at once.
      //
      // /product/standing-hip-thrust goes to the SELECTORISED machine because
      // that is what it was serving: MSLBPL28 shared the name until it was
      // retired, leaving MSLBSE07 alone on the page.
      { source: "/product/standing-hip-thurst", destination: "/product/standing-hip-thrust-plate-loaded", permanent: true },
      { source: "/product/standing-hip-thrust", destination: "/product/standing-hip-thrust-selectorised", permanent: true },

      // ONE BARBELL RANGE, ONE PAGE, 2026-09-15. The ERP held a single 5kg-50kg
      // urethane fixed barbell line under TWO names - "Urethane Fixed Barbells"
      // on five codes and "Fixed PU Straight Barbell" on fourteen - so the
      // catalogue built two units and two pages, each showing alternate weights
      // of the same range and both titled "Urethane Fixed Barbells". Renaming
      // all fourteen merged them into one unit with all nineteen sizes.
      //
      // The survivor is the -2 slug, not the prettier one, because a range is
      // routed to the snapshot bundle page it has always been reachable at
      // (MWBBFUR-GROUP) - see the note in erp-catalogue.ts. So the clean URL is
      // the one that has to redirect.
      { source: "/product/urethane-fixed-barbells", destination: "/product/urethane-fixed-barbells-2", permanent: true },

      // THE WORDPRESS SUBCATEGORY URLS WERE REDIRECTED FROM HERE, and are now
      // SERVED. Found in Semrush on 2026-09-15 rather than in the 404 log —
      // because nobody clicks them, Google is just still ranking them. The old
      // store nested a subcategory under its category
      // (/equipment/body-weight/gymnastics/), this site had only
      // /equipment/[category] with the subgroup as ?sub=, and that URL — ranked
      // 45 for "wooden gymnastic rings" and 44 for "wooden gym rings" — answered
      // 404 from the cutover until a redirect was added here that morning.
      //
      // The redirect is gone because the page is real: /equipment/[category]/[sub]
      // now renders the subcategories in lib/subcategories.ts, and sends every
      // OTHER :sub to the `?sub=` filter itself. A redirect here would shadow the
      // route entirely — next.config redirects are matched before routing — and
      // the config cannot know which subcategories have been written without
      // being edited in step with the registry. One list, in one place.

      // THE WORDPRESS ERA. The cutover on 27 August moved the apex to this site,
      // and everything the old store served that this one does not has been
      // answering 404 ever since: 69 `/product-category/<slug>` archives (the
      // biggest of them covered 106 products) and 225 product URLs the four
      // visibility rules exclude. None of it was linked from here — the internal
      // link graph is clean — so it is invisible from inside the site and only
      // shows up as inbound traffic dying.
      //
      // Generated, not hand-written, because "what does this site refuse to
      // serve" is a question only the visibility rules can answer, and a
      // redirect whose source still serves would delete a working page: these
      // are matched BEFORE routing. See scripts/legacy-redirects.report.ts for
      // the ERP-rescue trap that makes that a live risk.
      ...legacyRedirects.redirects.map((r) => ({ ...r, permanent: true })),
    ];
  },
};

// OPINLY POWERS /blog. The wrapper does exactly two things, both of which the
// blog route depends on: it rewrites `imagesPath` to the Opinly CDN, and it
// injects OPINLY_SITE_URL / OPINLY_BLOG_PREFIX / OPINLY_IMAGES_PREFIX into the
// build. @opinly/backend 1.6+ reads the first two and reports them as headers on
// the content calls this app already makes, which is what tells Opinly the live
// URL of each post it publishes - and therefore what joins a post to its search
// and traffic data. There is no separate wiring for that; without the wrapper
// Opinly holds no live URL for these posts at all.
//
// `unoptimizedImages: true` IS THE LINE THAT KEEPS THE IMAGES ON THE PAGE.
// Read the `images.unoptimized` note above first: this site blanked sitewide
// once already when Vercel's optimiser hit its quota and started answering 402
// on every transformation. Blog images arrive from Opinly's CDN through the
// /blog-images rewrite, which makes them same-origin paths that next/image
// would happily feed to that same optimiser - a fresh set of billable
// transformations, on content that is published continuously rather than
// mirrored once. This flag is what lib/blog reads to keep them out of it, and
// it must survive any future attempt to turn optimisation back on: the sitewide
// switch above and this one are two locks on the same door, not a duplicate.
//
// `imagesPath` is `/blog-images` rather than `/images`. `public/images` does not
// exist today, so `/images` would work - but a rewrite is invisible from the
// filesystem, and the day someone adds `public/images` (this repo mirrors
// catalogue photography into /public on a script) Next would serve those static
// files in preference and every blog image would 404 with nothing in the diff to
// explain it. A prefix that names what it carries cannot collide.
export default OPINLY_CDN_NAMESPACE
  ? withOpinlyConfig({
      blogPath: "/blog",
      imagesPath: "/blog-images",
      companyName: "MASTERKRAFT",
      cdnNamespace: OPINLY_CDN_NAMESPACE,
      // THE APEX, LITERALLY, and not lib/site's SITE_URL. That constant falls
      // back to the vercel.app hostname whenever NEXT_PUBLIC_SITE_URL is unset,
      // which is every preview deployment - and this value is not cosmetic:
      // it is reported to Opinly as the live address of every post, so a
      // preview build would overwrite the real URLs with its own throwaway
      // ones and detach each post from its search data. A post has one
      // canonical home; www redirects to the apex, so this is it.
      siteUrl: "https://masterkraft.com",
      unoptimizedImages: true,
    })(nextConfig)
  : nextConfig;
