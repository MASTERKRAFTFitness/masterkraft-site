"""Rebuild the MasterKraft Recovery Roller brochure.

    python3 build.py

MasterKraft version of the supplier's A72 "Body Shaping Roller Device" manual
(src/). Same machine as /recovery-roller on the site, so brochure.html follows
the same rule: no benefit claims, pending the TGA question.

Exports brochure.html with headless Chrome, then writes:
  MasterKraft-Recovery-Roller-Brochure.pdf   8 pages, A4
  preview.png                                all pages on one sheet

img/roller-detail.jpg is the showroom shot from ../fiit30-flyer/src, cropped
above the Fernwood logo. Needs Google Chrome, PyMuPDF and the network (fonts
come from Google Fonts).
"""
import subprocess
from pathlib import Path

import fitz

HERE = Path(__file__).resolve().parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT = HERE / "MasterKraft-Recovery-Roller-Brochure.pdf"


def main():
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--allow-file-access-from-files",
                    "--virtual-time-budget=10000", "--no-pdf-header-footer",
                    f"--print-to-pdf={OUT}", (HERE / "brochure.html").as_uri()],
                   check=True, stderr=subprocess.DEVNULL)

    doc = fitz.open(OUT)
    cols, scale, gap = 4, 0.5, 12
    w, h = doc[0].rect.width * scale, doc[0].rect.height * scale
    rows = -(-doc.page_count // cols)
    sheet = fitz.open()
    pg = sheet.new_page(width=cols * w + (cols + 1) * gap, height=rows * h + (rows + 1) * gap)
    pg.draw_rect(pg.rect, color=None, fill=(.85, .85, .86))
    for i in range(doc.page_count):
        r, c = divmod(i, cols)
        x, y = gap + c * (w + gap), gap + r * (h + gap)
        pg.show_pdf_page(fitz.Rect(x, y, x + w, y + h), doc, i)
    pg.get_pixmap(dpi=110).save(HERE / "preview.png")
    print(f"{OUT.name}: {doc.page_count} pages")


if __name__ == "__main__":
    main()
