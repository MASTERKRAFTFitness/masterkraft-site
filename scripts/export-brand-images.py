#!/usr/bin/env python3
"""
Export one brand's ERP product photography as catalogue-ready cutouts.

Run:  python3 scripts/export-brand-images.py SNAP [--out DIR] [--mode MODE]

WHY THIS IS NOT normalize-erp-bg.py. That script serves the SHOP, whose product
tiles are painted #e6e6e6, so it repaints an off-shade backdrop to match them
and leaves the 179 photos already on that grey alone. A catalogue is a different
surface with a different background — usually white paper — and on it the tile
grey is not the cure, it is the same disease: a grey box floating on a white
page. So this exports a CUTOUT by default, transparent right up to the product,
which composites onto whatever the layout uses.

BRANDS THE SHOP NEVER RENDERS ARE THE POINT. SNAP, REVL, Fernwood, Gold's and
Air Locker are portal-and-catalogue brands (see isPortalOnlyBrand); erpUnits
admits MK, Concept 2 and No Brand only. Their repaints ship inside /public and
are served by no page, so a catalogue needs them handed over as files.

MODES
  transparent  (default) PNG, backdrop knocked out. Works on any page colour.
  white        JPEG on flat white, for a layout that wants opaque assets.
  tile         JPEG on #e6e6e6, matching the shop. Rarely what a catalogue wants.

IN-SCENE PHOTOGRAPHY IS PASSED THROUGH UNTOUCHED and marked in the manifest. A
lifestyle shot has no flat backdrop to remove, and cutting one out would take
the room with it.

Writes a manifest.csv beside the images — code, description, mode, and whether a
backdrop was found — so the catalogue can be laid out from it directly.

Requires UNLEASHED_API_ID / UNLEASHED_API_KEY in .env.local.
"""
import argparse
import base64
import csv
import hashlib
import hmac
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

ROOT = SCRIPTS.parent
BASE = "https://api.unleashedsoftware.com"
PAGE_SIZE = 200
MAX_PAGES = 16
JPEG_QUALITY = 92  # higher than the web's 88: this is a print-bound asset


def unleashed_get(api_id, api_key, path, page):
    query = f"pageSize={PAGE_SIZE}"
    sig = base64.b64encode(
        hmac.new(api_key.encode(), query.encode(), hashlib.sha256).digest()
    ).decode()
    req = urllib.request.Request(
        f"{BASE}/{path}/{page}?{query}",
        headers={
            "api-auth-id": api_id,
            "api-auth-signature": sig,
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def default_image(p):
    """The one photo the ERP calls primary. Same rule as lib/unleashed.ts."""
    imgs = p.get("Images") or []
    for i in imgs:
        if i.get("IsDefault") and i.get("Url"):
            return i["Url"]
    for i in imgs:
        if i.get("Url"):
            return i["Url"]
    return p.get("ImageUrl")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("brand", help='ERP brand name, e.g. SNAP (case-insensitive)')
    ap.add_argument("--out", default=None, help="output directory")
    ap.add_argument("--mode", default="transparent",
                    choices=["transparent", "white", "tile"])
    args = ap.parse_args()

    api_id = store_dns_pin.from_env_file("UNLEASHED_API_ID")
    api_key = store_dns_pin.from_env_file("UNLEASHED_API_KEY")
    if not api_id or not api_key:
        sys.exit("Missing UNLEASHED_API_ID / UNLEASHED_API_KEY in .env.local")

    first = unleashed_get(api_id, api_key, "Products", 1)
    items = list(first["Items"])
    pages = min((first.get("Pagination") or {}).get("NumberOfPages") or 1, MAX_PAGES)
    for p in range(2, pages + 1):
        items += unleashed_get(api_id, api_key, "Products", p)["Items"]

    wanted = args.brand.strip().upper()
    rows = []
    for p in items:
        code = (p.get("ProductCode") or "").strip()
        brand = ((p.get("ProductBrand") or {}).get("BrandName") or "").strip().upper()
        url = default_image(p)
        if code and url and brand == wanted:
            rows.append((code.upper(), (p.get("ProductDescription") or "").strip(), url))
    if not rows:
        brands = sorted({((q.get("ProductBrand") or {}).get("BrandName") or "").strip()
                         for q in items} - {""})
        sys.exit(f"No products with photos for brand {wanted!r}. Known brands: {brands}")

    out_dir = Path(args.out) if args.out else ROOT / "reports" / f"{wanted.lower()}-images"
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"{len(rows)} {wanted} products with a photo -> {out_dir}  (mode: {args.mode})")

    manifest = []
    cut = passed = failed = 0
    for code, desc, url in sorted(rows):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                im = Image.open(io.BytesIO(r.read())).convert("RGB")
        except (urllib.error.URLError, OSError, ValueError) as e:
            print(f"  ! {code}: fetch failed ({str(e)[:50]})")
            failed += 1
            continue

        colour = bd.backdrop_colour(im)
        studio = bd.is_studio(colour)
        safe = re.sub(r"[^A-Za-z0-9_-]", "_", code)

        if args.mode == "transparent":
            out = bd.cutout(im)
            name = f"{safe}.png"
            out.save(out_dir / name)
        else:
            fill = (255, 255, 255) if args.mode == "white" else bd.TARGET
            if studio:
                flat = Image.new("RGB", im.size, fill)
                flat.paste(im, (0, 0), bd.cutout(im).split()[3])
                out = flat
            else:
                out = im
            name = f"{safe}.jpg"
            out.save(out_dir / name, quality=JPEG_QUALITY)

        if studio:
            cut += 1
        else:
            passed += 1
        manifest.append({
            "code": code,
            "description": desc,
            "file": name,
            "backdrop": "removed" if studio else "in-scene, left as shot",
            "backdrop_colour": "#%02x%02x%02x" % colour,
        })

    with (out_dir / "manifest.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(manifest[0]))
        w.writeheader()
        w.writerows(manifest)

    mb = sum(f.stat().st_size for f in out_dir.iterdir() if f.is_file()) / 1e6
    print(f"\n{cut} backdrops removed, {passed} in-scene passed through, {failed} failed")
    print(f"{mb:.1f} MB in {out_dir.relative_to(ROOT) if out_dir.is_relative_to(ROOT) else out_dir}")


if __name__ == "__main__":
    main()
