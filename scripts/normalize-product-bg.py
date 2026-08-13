#!/usr/bin/env python3
"""
Normalize off-shade product photo backgrounds to the shop tile grey (#e6e6e6).

Most MasterKraft product photography is shot on a flat #e6e6e6 studio grey, which
matches the shop's product-image tiles seamlessly. A few product lines (notably
the Selectorize strength machines) were shot on a different flat grey (#dadada),
so they show as a subtly off-shade box on the grid.

This script scans every published product, and for any whose photo background is
a flat grey that ISN'T #e6e6e6, it flood-fills the contiguous background from the
corners and repaints it #e6e6e6 (leaving the product and its shadow untouched).
Normalized images are written to public/product-bg/<sku>-<n>.jpg and a
sku -> [local paths] map is written to src/lib/product-image-overrides.json,
which the WooCommerce layer applies at fetch time.

Re-run whenever the catalogue changes:  python3 scripts/normalize-product-bg.py

Requires WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET in .env.local.
"""
import base64
import io
import json
import os
import re
import ssl
import sys
import urllib.request
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "product-bg"
MAP_FILE = ROOT / "src" / "lib" / "product-image-overrides.json"

TARGET = (230, 230, 230)          # #e6e6e6 — the shop tile grey
TARGET_HEX = "#e6e6e6"
MATCH_TOLERANCE = 6               # backgrounds this close to target are already fine
FLOOD_THRESH = 28                 # contiguous-fill tolerance around the bg colour
COLOR_SPREAD = 18                 # channel spread above this = a coloured (non-grey) bg, skip
MIN_BG_VALUE = 190                # corner must be light to be a background (not a dark product)


def load_env():
    env = {}
    envfile = ROOT / ".env.local"
    for line in envfile.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("WC_STORE_URL", "WC_CONSUMER_KEY", "WC_CONSUMER_SECRET"):
        if not env.get(k):
            sys.exit(f"Missing {k} in .env.local")
    return env


CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def fetch(url, auth=None):
    headers = {"User-Agent": "Mozilla/5.0"}
    if auth:
        headers["Authorization"] = f"Basic {auth}"
    req = urllib.request.Request(url, headers=headers)
    return urllib.request.urlopen(req, timeout=45, context=CTX).read()


def corner_bg(im):
    w, h = im.size
    corners = [im.getpixel((3, 3)), im.getpixel((w - 4, 3)),
               im.getpixel((3, h - 4)), im.getpixel((w - 4, h - 4))]
    return Counter(corners).most_common(1)[0][0]


def is_off_shade(c):
    r, g, b = c
    if max(abs(r - g), abs(g - b), abs(r - b)) > COLOR_SPREAD:
        return False  # coloured background (e.g. turf on grass) — intentional, leave it
    v = (r + g + b) // 3
    if v < MIN_BG_VALUE:
        return False  # too dark to be a studio background
    if abs(v - TARGET[0]) <= MATCH_TOLERANCE:
        return False  # already matches the tile
    return True


def normalize(im, bg):
    """Flood-fill the contiguous background from each corner and repaint #e6e6e6."""
    im = im.convert("RGB")
    w, h = im.size
    for seed in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]:
        if im.getpixel(seed) == bg or _close(im.getpixel(seed), bg):
            ImageDraw.floodfill(im, seed, TARGET, thresh=FLOOD_THRESH)
    return im


def _close(a, b, t=FLOOD_THRESH):
    return all(abs(a[i] - b[i]) <= t for i in range(3))


CLEARANCE_CAT = 356           # ex-display category — shown despite non-M/N SKUs
BRAND_SKU_RE = re.compile(r"^[MN]", re.I)


def main():
    env = load_env()
    base = env["WC_STORE_URL"]
    auth = base64.b64encode(f"{env['WC_CONSUMER_KEY']}:{env['WC_CONSUMER_SECRET']}".encode()).decode()

    products = []
    for page in range(1, 6):
        data = json.loads(fetch(
            f"{base}/wp-json/wc/v3/products?per_page=100&page={page}&status=publish&_fields=sku,images",
            auth))
        if not data:
            break
        products += data

    # Only normalize products the site actually renders: MasterKraft's own M/N
    # SKUs (branded categories + grid) plus the clearance category (A-SKUs). The
    # rest are hidden by the M/N brand filter, so normalizing them is dead weight.
    clearance_skus = set()
    for page in range(1, 3):
        data = json.loads(fetch(
            f"{base}/wp-json/wc/v3/products?category={CLEARANCE_CAT}&per_page=100&page={page}&status=publish&_fields=sku",
            auth))
        if not data:
            break
        clearance_skus |= {(p.get("sku") or "").strip() for p in data if p.get("sku")}

    def displayed(sku):
        return bool(BRAND_SKU_RE.match(sku)) or sku in clearance_skus

    products = [p for p in products if displayed((p.get("sku") or "").strip())]
    print(f"scanning {len(products)} displayed products (M/N + {len(clearance_skus)} clearance)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("*.jpg"):   # clean previous run so removed SKUs don't linger
        stale.unlink()
    overrides = {}
    flagged = 0
    for p in products:
        sku = (p.get("sku") or "").strip()
        imgs = p.get("images") or []
        if not sku or not imgs:
            continue
        try:
            first = Image.open(io.BytesIO(fetch(imgs[0]["src"]))).convert("RGB")
        except Exception as e:
            print(f"  ! {sku}: fetch failed ({str(e)[:40]})")
            continue
        bg = corner_bg(first)
        if not is_off_shade(bg):
            continue
        flagged += 1
        local_paths = []
        for i, img in enumerate(imgs):
            try:
                src = first if i == 0 else Image.open(io.BytesIO(fetch(img["src"]))).convert("RGB")
                fixed = normalize(src, corner_bg(src))
                safe = re.sub(r"[^A-Za-z0-9_-]", "_", sku)
                out_name = f"{safe}-{i + 1}.jpg"
                fixed.save(OUT_DIR / out_name, quality=88)
                local_paths.append(f"/product-bg/{out_name}")
            except Exception as e:
                print(f"  ! {sku} img {i}: {str(e)[:40]}")
        if local_paths:
            overrides[sku] = local_paths
            print(f"  ✓ {sku}: bg {bg} -> {TARGET_HEX}  ({len(local_paths)} img)")

    MAP_FILE.write_text(json.dumps(overrides, indent=2, sort_keys=True) + "\n")
    print(f"\nflagged {flagged} products; wrote {len(overrides)} overrides -> {MAP_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
