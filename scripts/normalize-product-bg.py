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
proof left in the repo — the old script "normalized" it and its backdrop is
still #dedede. See backdrop.py for how the backdrop is told apart from product.

THIS SCRIPT IS NOW OFFLINE, and that is not a preference. It used to enumerate
products from the WooCommerce REST API at WC_STORE_URL, but the August cutover
pointed masterkraft.com at Vercel and WordPress never came back on a subdomain:
/wp-json/wc/v3/products answers 404, so the old flow could not get past its
first request. Everything it needs already survives in the repo — the mirrored
files under /public and the sku -> paths map — so that is what it reads.

WHAT IT WILL NOT DO IS DELETE. The old version emptied /public/product-bg at the
start of every run to clear stale files. That is now unrecoverable: the mirror
skips any SKU that already has an override, so not one of the 45 files in
product-bg has a raw counterpart in product-images, and the WordPress original
is gone. Those files are the only copies that exist. Nothing here unlinks.

WHERE OUTPUT GOES. A repainted /product-images file is written to /product-bg and
the map is repointed, keeping the raw mirror intact as the original — which is
what made revising the algorithm possible at all. A file that only exists in
/product-bg has no original left to preserve, so it is repainted in place; that
is idempotent, because a backdrop already at tile grey is skipped on the next run.

THE MAP IS SHARED, SO IT IS MERGED, NOT OVERWRITTEN. product-image-overrides.json
holds entries from two writers: this script's /product-bg copies and the ~870
/product-images paths that scripts/mirror-product-images.mjs put there to get the
catalogue off the WordPress host. Writing it wholesale — which the old version
did — would delete every mirrored entry and point 300+ products back at
masterkraft.com/wp-content, which now 404s.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backdrop as bd  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
RAW_DIR = PUBLIC / "product-images"
OUT_DIR = PUBLIC / "product-bg"
MAP_FILE = ROOT / "src" / "lib" / "product-image-overrides.json"

JPEG_QUALITY = 88  # the house setting - see scripts/compress-assets.py


def local_file(path):
    """Resolve a mapped web path (/product-images/x.jpg) to a file on disk."""
    return PUBLIC / path.lstrip("/")


def main():
    overrides = json.loads(MAP_FILE.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    repainted_in_place = 0
    moved_to_bg = 0
    missing = 0
    skipped = 0
    changed_skus = []

    for sku in sorted(overrides):
        paths = overrides[sku]
        files = [local_file(p) for p in paths]
        if not all(f.exists() for f in files):
            # The guard in src/lib/image-overrides.test.ts exists for this, so it
            # should never fire; report rather than repaint a partial gallery.
            print(f"  ! {sku}: mapped file missing, left alone")
            missing += 1
            continue

        images = [Image.open(f).convert("RGB") for f in files]
        colours = [bd.backdrop_colour(im) for im in images]
        wanted = [bd.needs_normalizing(c) for c in colours]
        if not any(wanted):
            skipped += 1
            continue

        safe = re.sub(r"[^A-Za-z0-9._-]", "_", sku)
        if all(p.startswith("/product-bg/") for p in paths):
            # No original survives for these, so the repaint lands on the file
            # itself. Idempotent: next run sees tile grey and skips it.
            for f, im, fix, colour in zip(files, images, wanted, colours):
                if fix:
                    bd.normalize(im).save(f, quality=JPEG_QUALITY)
                    print(f"  ok {sku}: {colour} -> {bd.TARGET_HEX}  (in place, {f.name})")
            repainted_in_place += 1
        else:
            # Raw mirror stays untouched; the repaint is a new file in product-bg
            # and the whole array is repointed, because the override REPLACES the
            # images array and an image left out would vanish from the gallery.
            new_paths = []
            for i, (im, fix, colour) in enumerate(zip(images, wanted, colours)):
                out = bd.normalize(im) if fix else im
                name = f"{safe}-{i + 1}.jpg"
                out.save(OUT_DIR / name, quality=JPEG_QUALITY)
                new_paths.append(f"/product-bg/{name}")
            overrides[sku] = new_paths
            fixed_at = ", ".join(str(colours[i]) for i, f in enumerate(wanted) if f)
            print(f"  ok {sku}: {fixed_at} -> {bd.TARGET_HEX}  ({len(new_paths)} img -> product-bg)")
            moved_to_bg += 1
        changed_skus.append(sku)

    MAP_FILE.write_text(json.dumps(overrides, indent=2, sort_keys=True) + "\n")
    mirrored = sum(1 for v in overrides.values() if any(p.startswith("/product-images/") for p in v))
    print(
        f"\nrepainted {len(changed_skus)} products "
        f"({moved_to_bg} moved to product-bg, {repainted_in_place} fixed in place)"
    )
    print(f"skipped {skipped} already on tile grey; {missing} with a missing file")
    print(f"map holds {len(overrides)} entries ({mirrored} still mirrored) -> "
          f"{MAP_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
