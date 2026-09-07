#!/usr/bin/env python3
"""Repaint the ERP product photos whose backdrop isn't the shop tile grey.

Run:  npm run normalize:erp-bg     (then commit /public/erp-bg + the JSON)

WHY THIS EXISTS SEPARATELY FROM normalize-product-bg.py. That script fixes the
WooCommerce photos, which is a DIFFERENT SET OF FILES. Since the ERP became the
catalogue (lib/erp-catalogue.ts), the grid and the range pickers render
`entry.image` - a URL on Unleashed's own CDN - and the WooCommerce override map
never touches those. On /all-equipment every one of the 24 cards on page one is
an Unleashed URL and none is a mirrored file, so the WooCommerce normalizer was
fixing images the shop had stopped serving.

WHAT IT FIXES. 1075 ERP products carry a photo. Most were shot on the #e6e6e6
studio grey the shop's tiles are painted, but 178 are on pure white and ~50 on
an off-shade grey, and `object-contain` on a grey tile renders those as a white
box floating inside the tile - the thing that makes the grid look broken.

WHAT IT LEAVES ALONE. Coloured backdrops (a product shot on turf) and in-scene
lifestyle photography are deliberate, so `needs_normalizing` skips both. Only a
flat, neutral, light studio backdrop is repainted. See scripts/backdrop.py for
how the backdrop is told apart from the product.

ONLY THE DEFAULT IMAGE, because that is the only one the site can render:
UnleashedEntry.image is a single URL, chosen by the rule repeated below, and
every consumer (the grid, ranges.ts, the variant picker) reads that one field.

WRITES A NARROW OVERRIDE MAP. Products already on tile grey keep their CDN URL;
only the repainted ones get a local file. That keeps the repo addition to the
images that actually changed rather than mirroring the whole catalogue.

Requires UNLEASHED_API_ID / UNLEASHED_API_KEY in .env.local.
"""

import base64
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import backdrop as bd  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "erp-bg"
MAP_FILE = ROOT / "src" / "lib" / "erp-image-overrides.json"
BASE = "https://api.unleashedsoftware.com"
PAGE_SIZE = 200
MAX_PAGES = 16  # runaway guard, matching lib/unleashed.ts
JPEG_QUALITY = 88  # the house setting - see scripts/compress-assets.py


def load_env():
    env = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("UNLEASHED_API_ID", "UNLEASHED_API_KEY"):
        if not env.get(k):
            sys.exit(f"Missing {k} in .env.local")
    return env


def unleashed_get(env, path, page):
    # The query string is what gets HMAC-signed, so it must match the URL exactly.
    query = f"pageSize={PAGE_SIZE}"
    sig = base64.b64encode(
        hmac.new(env["UNLEASHED_API_KEY"].encode(), query.encode(), hashlib.sha256).digest()
    ).decode()
    req = urllib.request.Request(
        f"{BASE}/{path}/{page}?{query}",
        headers={
            "api-auth-id": env["UNLEASHED_API_ID"],
            "api-auth-signature": sig,
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0",  # Unleashed's WAF rejects some default agents
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def fetch_products(env):
    first = unleashed_get(env, "Products", 1)
    items = list(first["Items"])
    pages = min((first.get("Pagination") or {}).get("NumberOfPages") or 1, MAX_PAGES)
    for p in range(2, pages + 1):
        items += unleashed_get(env, "Products", p)["Items"]
    return items


def default_image(p):
    """The one URL the site renders. Same rule as lib/unleashed.ts."""
    imgs = p.get("Images") or []
    for i in imgs:
        if i.get("IsDefault") and i.get("Url"):
            return i["Url"]
    for i in imgs:
        if i.get("Url"):
            return i["Url"]
    return p.get("ImageUrl")


def fetch_image(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


def main():
    env = load_env()
    products = fetch_products(env)
    candidates = []
    for p in products:
        code = (p.get("ProductCode") or "").strip()
        url = default_image(p)
        if code and url:
            candidates.append((code.upper(), url))
    print(f"{len(products)} ERP products, {len(candidates)} with a photo")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("*.jpg"):  # a code that no longer needs fixing must not linger
        stale.unlink()

    overrides = {}
    skipped = {"tile grey": 0, "coloured or in-scene": 0}
    failed = 0
    for code, url in candidates:
        try:
            im = fetch_image(url)
        except (urllib.error.URLError, OSError, ValueError) as e:
            print(f"  ! {code}: fetch failed ({str(e)[:50]})")
            failed += 1
            continue
        colour = bd.backdrop_colour(im)
        if not bd.needs_normalizing(colour):
            r, g, b = colour
            spread = max(abs(r - g), abs(g - b), abs(r - b))
            key = (
                "coloured or in-scene"
                if spread > bd.COLOR_SPREAD or (r + g + b) // 3 < bd.MIN_BG_VALUE
                else "tile grey"
            )
            skipped[key] += 1
            continue
        fixed = bd.normalize(im)
        name = f"{re.sub(r'[^A-Za-z0-9_-]', '_', code)}.jpg"
        fixed.save(OUT_DIR / name, quality=JPEG_QUALITY)
        overrides[code] = f"/erp-bg/{name}"
        left = bd.residual(fixed, colour)
        flag = "  <-- CHECK" if left > 0.03 else ""
        print(f"  ok {code}: {colour} -> {bd.TARGET_HEX}  ({100 * left:.1f}% left){flag}")

    MAP_FILE.write_text(json.dumps(overrides, indent=2, sort_keys=True) + "\n")
    mb = sum(f.stat().st_size for f in OUT_DIR.glob("*.jpg")) / 1e6
    print(
        f"\nrepainted {len(overrides)}  |  skipped {skipped['tile grey']} already on tile grey, "
        f"{skipped['coloured or in-scene']} coloured/in-scene  |  {failed} failed"
    )
    print(f"wrote {mb:.1f} MB -> {OUT_DIR.relative_to(ROOT)} and {MAP_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
