#!/usr/bin/env python3
"""
Normalize off-shade product photo backgrounds to the shop tile grey (#e6e6e6).

Most MasterKraft product photography is shot on a flat #e6e6e6 studio grey, which
matches the shop's product-image tiles seamlessly. A few product lines (notably
the Selectorize strength machines) were shot on a different flat grey, and some
on pure white, so they show as an off-shade box floating on the grid.

Run:  python3 scripts/normalize-product-bg.py     (then commit the result)

THE REPAINT ITSELF LIVES IN scripts/backdrop.py, shared with
scripts/normalize-erp-bg.py — the same defect arrives from both WooCommerce and
Unleashed, and only the sourcing differs. That module replaced the corner
flood-fill this script used to carry, which could not reach backdrop ENCLOSED by
the product: a rack or a Pilates ring is a frame you see through, and the grey
between its uprights is not contiguous with any corner. MRWAATT01-1.jpg is the
worked example — the old script "normalized" it and left it at #dedede.

IT NEEDS THE DNS PIN, because the store has no working DNS name. The 27 August
cutover gave masterkraft.com to Vercel; the WooCommerce install is untouched and
still serving on the old server, but a plain request for its hostname now gets
Vercel's 404. scripts/lib/store_dns_pin.py resolves that one host itself, the
same splint scripts/lib/store-dns-pin.mjs has always given the Node scripts.
Without it this script dies on its first request, and the failure reads
convincingly like the store having been decommissioned. It has not been.

WHERE THE PIXELS COME FROM, cheapest first, because that host refuses bursts:
  * the mirrored /product-images file, when the map already points at one —
    a verbatim copy of the original, so there is nothing to gain by re-fetching;
  * the WooCommerce original otherwise, which is the only source for a product
    that is new, and for the /product-bg SKUs the mirror deliberately skipped.
Working from the true original matters: it is what lets a revised algorithm redo
a photo properly instead of repainting an already-repainted copy.

WHAT IT WILL NOT DO IS DELETE. The old version emptied /public/product-bg at the
start of every run. Those files are the only LOCAL copies — the mirror skips any
SKU that already has an override, so none of them has a raw counterpart in
/product-images — and deleting them mid-run would leave the site with neither
while the map still pointed at them. Nothing here unlinks.

THE MAP IS SHARED, SO IT IS MERGED, NOT OVERWRITTEN. product-image-overrides.json
holds entries from two writers: this script's /product-bg copies and the ~830
/product-images paths that scripts/mirror-product-images.mjs put there. Writing
it wholesale — which the old version did — would delete every mirrored entry and
point 300+ products back at a hostname that now answers from Vercel.

Requires WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET and, until the store
has a real hostname again, WC_STORE_PIN in .env.local.
"""
import base64
import io
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(SCRIPTS / "lib"))
import backdrop as bd  # noqa: E402
import store_dns_pin  # noqa: E402

# Must come before any fetch: it steers the store hostname while the store has
# no working DNS name. Inert unless WC_STORE_PIN is set. See the module for why.
store_dns_pin.install()

ROOT = SCRIPTS.parent
PUBLIC = ROOT / "public"
OUT_DIR = PUBLIC / "product-bg"
MAP_FILE = ROOT / "src" / "lib" / "product-image-overrides.json"

JPEG_QUALITY = 88  # the house setting - see scripts/compress-assets.py
CLEARANCE_CAT = 356  # ex-display category — shown despite non-M/N SKUs
BRAND_SKU_RE = re.compile(r"^[MN]", re.I)


def env(name, required=True):
    value = store_dns_pin.from_env_file(name)
    if not value and required:
        sys.exit(f"Missing {name} in .env.local")
    return value


def fetch(url, auth=None):
    headers = {"User-Agent": "Mozilla/5.0"}
    if auth:
        headers["Authorization"] = f"Basic {auth}"
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=45).read()


def fetch_catalogue(base, auth):
    """sku -> [image urls] for every product the site actually renders.

    Returns None if the store cannot be reached, so a run without the pin (or
    with the WordPress host genuinely down) degrades to repainting what is
    already committed rather than dying.
    """
    try:
        products = []
        for page in range(1, 6):
            data = json.loads(fetch(
                f"{base}/wp-json/wc/v3/products?per_page=100&page={page}"
                "&status=publish&_fields=sku,images", auth))
            if not data:
                break
            products += data

        # Only the products the site renders: MasterKraft's own M/N SKUs plus
        # the clearance category (A-SKUs). The rest are hidden by the brand
        # filter, so normalizing them is dead weight.
        clearance = set()
        for page in range(1, 3):
            data = json.loads(fetch(
                f"{base}/wp-json/wc/v3/products?category={CLEARANCE_CAT}&per_page=100"
                f"&page={page}&status=publish&_fields=sku", auth))
            if not data:
                break
            clearance |= {(p.get("sku") or "").strip() for p in data if p.get("sku")}
    except (urllib.error.URLError, OSError, ValueError) as e:
        print(f"  ! store unreachable ({str(e)[:60]})")
        return None

    out = {}
    for p in products:
        sku = (p.get("sku") or "").strip()
        urls = [i["src"] for i in (p.get("images") or []) if i.get("src")]
        if sku and urls and (BRAND_SKU_RE.match(sku) or sku in clearance):
            out[sku] = urls
    return out


def main():
    base = env("WC_STORE_URL")
    auth = base64.b64encode(
        f"{env('WC_CONSUMER_KEY')}:{env('WC_CONSUMER_SECRET')}".encode()
    ).decode()

    overrides = json.loads(MAP_FILE.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    catalogue = fetch_catalogue(base, auth)
    if catalogue is None:
        # Not a failure worth aborting on, but the difference matters: a
        # committed-only run cannot see a product that was added since the last
        # mirror, so a new white-backdrop photo would go unrepainted in silence.
        print("  ! working from the committed map only — NEW PRODUCTS WILL NOT BE SEEN")
        catalogue = {sku: [] for sku in overrides}
    else:
        print(f"{len(catalogue)} displayed products with photos")

    repainted, skipped, failed = [], 0, 0
    for sku in sorted(catalogue):
        mapped = overrides.get(sku)
        local = [PUBLIC / p.lstrip("/") for p in mapped] if mapped else []
        # Prefer the mirrored original already on disk; fall back to the store.
        if mapped and all(f.exists() for f in local) and all(
            p.startswith("/product-images/") for p in mapped
        ):
            try:
                images = [Image.open(f).convert("RGB") for f in local]
            except OSError as e:
                print(f"  ! {sku}: unreadable local file ({str(e)[:40]})")
                failed += 1
                continue
        else:
            urls = catalogue[sku]
            if not urls:
                # Committed-only run, and this SKU's local copy is a repaint we
                # cannot re-derive. Re-reading it is idempotent, so it is safe.
                if not (mapped and all(f.exists() for f in local)):
                    continue
                images = [Image.open(f).convert("RGB") for f in local]
            else:
                try:
                    images = [Image.open(io.BytesIO(fetch(u))).convert("RGB") for u in urls]
                except (urllib.error.URLError, OSError, ValueError) as e:
                    print(f"  ! {sku}: fetch failed ({str(e)[:40]})")
                    failed += 1
                    continue

        colours = [bd.backdrop_colour(im) for im in images]
        wanted = [bd.needs_normalizing(c) for c in colours]
        if not any(wanted):
            skipped += 1
            continue

        # The override REPLACES the images array, so every image is written even
        # when only one needed repainting; one left out would vanish from the
        # gallery. Written beside the raw source, never over it.
        safe = re.sub(r"[^A-Za-z0-9._-]", "_", sku)
        paths = []
        for i, (im, fix) in enumerate(zip(images, wanted)):
            out = bd.normalize(im) if fix else im
            name = f"{safe}-{i + 1}.jpg"
            out.save(OUT_DIR / name, quality=JPEG_QUALITY)
            paths.append(f"/product-bg/{name}")
        overrides[sku] = paths
        repainted.append(sku)
        at = ", ".join(str(colours[i]) for i, f in enumerate(wanted) if f)
        print(f"  ok {sku}: {at} -> {bd.TARGET_HEX}  ({len(paths)} img)")

    MAP_FILE.write_text(json.dumps(overrides, indent=2, sort_keys=True) + "\n")
    mirrored = sum(1 for v in overrides.values() if any(p.startswith("/product-images/") for p in v))
    print(f"\nrepainted {len(repainted)}; skipped {skipped} already on tile grey; {failed} failed")
    print(f"map holds {len(overrides)} entries ({mirrored} still mirrored) -> "
          f"{MAP_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
