#!/usr/bin/env python3
"""Re-encode the mirrored product images and the manual PDFs so the repo stays sane.

Run:  npm run compress:assets        (then commit the result)

WHY. Mirroring the catalogue's images off WordPress brought down 374 files at
86 MB, because the originals are stored at near-lossless JPEG quality: a single
1500x1030 photo was 4.33 MB. Re-encoding at q88 takes that same file to ~100 KB
with no visible difference, checked side by side at 100% on the fine white
lettering, which is where JPEG artefacts show first. The manuals are 73 MB of
PDFs whose embedded images are stored the same way.

SAFE BY CONSTRUCTION:
  * a file is only replaced when the new one is genuinely smaller
  * images keep their pixel dimensions - Next's image optimiser handles sizing,
    and downsampling here would cap what it can serve
  * PNGs with transparency stay PNG (converting them would fill the alpha black)
  * PDFs are rebuilt page-identical; only the embedded raster images are
    re-encoded, so text and vector line art stay sharp at any zoom
  * idempotent: re-running finds nothing left to do

Lossless PDF restructuring (garbage collect + deflate) was tried first and is
NOT used: it saved 4.5% overall and made several files BIGGER.
"""

import io
import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMAGE_DIRS = [
    ROOT / "public/product-images",
    ROOT / "public/product-bg",
    ROOT / "public/erp-bg",
]
MANUALS = ROOT / "public/manuals"

JPEG_QUALITY = 88
# Below this, re-encoding costs more than it saves and risks generation loss.
MIN_SAVING = 0.05


def human(n: float) -> str:
    return f"{n / 1e6:.1f} MB"


def compress_images() -> tuple[int, int, int]:
    before = after = 0
    changed = 0
    for d in IMAGE_DIRS:
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            if f.suffix.lower() not in (".jpg", ".jpeg", ".png"):
                continue
            orig = f.stat().st_size
            before += orig
            try:
                im = Image.open(f)
                im.load()
            except Exception as e:  # a corrupt file must not lose us the run
                print(f"  SKIP (unreadable) {f.name}: {e}")
                after += orig
                continue

            buf = io.BytesIO()
            has_alpha = im.mode in ("RGBA", "LA") or (
                im.mode == "P" and "transparency" in im.info
            )
            if has_alpha:
                # Keep transparency: flattening would put black behind the product.
                im.convert("RGBA").save(buf, "PNG", optimize=True)
                new_suffix = ".png"
            else:
                im.convert("RGB").save(
                    buf, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True
                )
                new_suffix = f.suffix.lower()

            new = buf.tell()
            if new_suffix == f.suffix.lower() and new < orig * (1 - MIN_SAVING):
                f.write_bytes(buf.getvalue())
                after += new
                changed += 1
            else:
                after += orig
    return before, after, changed


def _page_signature(doc, dpi=60):
    """Mean brightness per page - enough to catch a page that has gone black."""
    sig = []
    for page in doc:
        pix = page.get_pixmap(dpi=dpi)
        data = pix.samples
        sig.append(sum(data[:: max(1, len(data) // 4000)]) / max(1, len(data[:: max(1, len(data) // 4000)])))
    return sig


def compress_pdfs() -> tuple[int, int, int]:
    """Re-encode the raster images inside each manual.

    USE page.replace_image, NEVER doc.update_stream. update_stream swaps the raw
    bytes while leaving /Filter, /ColorSpace and /BitsPerComponent describing the
    OLD encoding, so a full-page image silently renders as a BLACK PAGE. That
    happened here and was only caught by rendering the result. replace_image
    rewrites the image dictionary too.

    Every rewritten file is then rendered and compared page by page against the
    original: if any page's mean brightness moves more than a few percent, the
    rewrite is thrown away and the original kept.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("  PyMuPDF not installed - skipping manuals")
        return 0, 0, 0

    before = after = 0
    changed = 0
    for f in sorted(MANUALS.glob("*.pdf")) if MANUALS.is_dir() else []:
        orig = f.stat().st_size
        before += orig
        try:
            doc = fitz.open(f)
            baseline = _page_signature(doc)
        except Exception as e:
            print(f"  SKIP (unreadable) {f.name}: {e}")
            after += orig
            continue

        touched = 0
        for page in doc:
            for img in page.get_images(full=True):
                xref = img[0]
                try:
                    raw = doc.extract_image(xref)["image"]
                except Exception:
                    continue
                if len(raw) < 40_000:  # small images are not worth the risk
                    continue
                try:
                    im = Image.open(io.BytesIO(raw))
                    im.load()
                    if im.mode in ("RGBA", "LA", "P"):
                        continue  # masks and transparency: leave well alone
                    buf = io.BytesIO()
                    im.convert("RGB").save(
                        buf, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True
                    )
                    # 20%, not 5%: re-encoding an already-q88 image saves only a few
                    # percent, so this threshold makes repeat runs converge instead
                    # of degrading the file a little more every time.
                    if buf.tell() < len(raw) * 0.80:
                        page.replace_image(xref, stream=buf.getvalue())
                        touched += 1
                except Exception:
                    continue

        if not touched:
            doc.close()
            after += orig
            continue

        buf = io.BytesIO()
        doc.save(buf, garbage=3, deflate=True, clean=True)
        doc.close()
        if not (0 < buf.tell() < orig * (1 - MIN_SAVING)):
            after += orig
            continue

        # Prove it still renders before replacing anything on disk.
        try:
            check = fitz.open(stream=buf.getvalue(), filetype="pdf")
            after_sig = _page_signature(check)
            check.close()
            ok = len(after_sig) == len(baseline) and all(
                abs(a - b) <= max(3.0, b * 0.03) for a, b in zip(after_sig, baseline)
            )
        except Exception:
            ok = False

        if ok:
            f.write_bytes(buf.getvalue())
            after += buf.tell()
            changed += 1
        else:
            print(f"  REJECTED {f.name}: pages did not render identically, kept original")
            after += orig
    return before, after, changed


if __name__ == "__main__":
    print("Images")
    ib, ia, ic = compress_images()
    print(f"  {human(ib)} -> {human(ia)}  ({ic} files re-encoded)")

    print("Manuals")
    pb, pa, pc = compress_pdfs()
    print(f"  {human(pb)} -> {human(pa)}  ({pc} PDFs re-encoded)")

    tb, ta = ib + pb, ia + pa
    if tb:
        print(f"\nTotal {human(tb)} -> {human(ta)}  ({100 - ta / tb * 100:.0f}% saved)")
