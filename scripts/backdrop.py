"""Repaint a product photo's studio backdrop to the shop tile grey (#e6e6e6).

Shared by the two normalizers, because the SAME defect arrives from two sources:
scripts/normalize-product-bg.py (WooCommerce) and scripts/normalize-erp-bg.py
(Unleashed). Only the fetching differs; the picture problem is identical.

WHY NOT A CORNER FLOOD-FILL. That was the first implementation, and it fails on
exactly the products that need it most. A flood-fill only reaches backdrop that
is CONTIGUOUS with a corner, and a power rack, a squat stand or a Pilates ring
is a frame you can see through: the backdrop showing between the uprights is
enclosed by the product, so the fill never arrives. Measured over the 178
white-backdrop images in the ERP, a corner fill left 40 of them visibly patchy
and 19 more than a tenth unfilled - a white window inside a grey tile, which
reads as a rendering bug rather than as photography.

So the backdrop is selected by COLOUR rather than by reachability, which finds
enclosed regions for free. Selecting on colour alone would also catch white
lettering ("40KG" on a dumbbell) and chrome highlights, so the mask is then
opened - eroded and dilated - which deletes anything thinner than OPEN_PX while
leaving a large region its full extent. A closing pass follows for the reverse
problem: a PHOTOGRAPHED backdrop (as opposed to a render) carries JPEG chroma
noise that punches pinholes in the mask, which would survive as white freckles.

Every widening step is finally intersected with TOL_LOOSE of the backdrop, so
no amount of dilation can spill the fill onto the product itself.
"""

from collections import Counter

from PIL import Image, ImageChops, ImageFilter

TARGET = (230, 230, 230)  # #e6e6e6 - the shop's product-tile grey
TARGET_HEX = "#e6e6e6"

MATCH_TOLERANCE = 6  # this close to TARGET already, so there is nothing to fix
COLOR_SPREAD = 18    # channel spread above this is a COLOURED backdrop - deliberate, leave it
MIN_BG_VALUE = 190   # darker than this is a lifestyle/in-scene shot, not a studio backdrop

TOL = 11         # a pixel this close to the backdrop colour IS the backdrop
TOL_LOOSE = 33   # ...and nothing outside this may ever be repainted
SPREAD = 10      # backdrop pixels are neutral; a tint means product
OPEN_PX = 5      # white thinner than this is lettering or a highlight - keep it
CLOSE_PX = 9     # holes smaller than this are JPEG noise in the backdrop - fill it


def backdrop_colour(im):
    """The most common pixel around the border - the backdrop, if there is one.

    Sampled along all four edges rather than at the four corners: a product that
    runs off the edge of the frame can occupy a whole corner, and a corner-only
    vote then reports the product as the backdrop.
    """
    w, h = im.size
    step = max(1, min(w, h) // 64)
    edge = []
    for x in range(0, w, step):
        edge.append(im.getpixel((x, 2)))
        edge.append(im.getpixel((x, h - 3)))
    for y in range(0, h, step):
        edge.append(im.getpixel((2, y)))
        edge.append(im.getpixel((w - 3, y)))
    return Counter(edge).most_common(1)[0][0]


def needs_normalizing(c):
    """Is this backdrop colour a flat studio grey that ISN'T the tile grey?"""
    r, g, b = c
    if max(abs(r - g), abs(g - b), abs(r - b)) > COLOR_SPREAD:
        return False  # coloured backdrop (turf, a gym floor) - intentional
    v = (r + g + b) // 3
    if v < MIN_BG_VALUE:
        return False  # too dark to be a studio backdrop
    return abs(v - TARGET[0]) > MATCH_TOLERANCE


def _binary(img, keep):
    return img.point(lambda v: 255 if keep(v) else 0)


def _near(im, colour, tol):
    """Mask of pixels within `tol` of `colour` on every channel."""
    m = None
    for chan, want in zip(im.split(), colour):
        near = _binary(chan, lambda v, w=want: abs(v - w) <= tol)
        m = near if m is None else ImageChops.multiply(m, near)
    return m


def backdrop_mask(im, colour):
    lo = ImageChops.darker(ImageChops.darker(*im.split()[:2]), im.split()[2])
    hi = ImageChops.lighter(ImageChops.lighter(*im.split()[:2]), im.split()[2])
    neutral = _binary(ImageChops.difference(hi, lo), lambda v: v <= SPREAD)

    m = ImageChops.multiply(_near(im, colour, TOL), neutral)
    # Opening: drop lettering and specular highlights. Closing: heal the
    # pinholes JPEG noise leaves in a photographed backdrop.
    m = m.filter(ImageFilter.MinFilter(OPEN_PX)).filter(ImageFilter.MaxFilter(OPEN_PX))
    m = m.filter(ImageFilter.MaxFilter(CLOSE_PX)).filter(ImageFilter.MinFilter(CLOSE_PX))
    # One dilation to swallow the anti-aliased fringe the tight tolerance missed.
    m = m.filter(ImageFilter.MaxFilter(3))
    return ImageChops.multiply(m, _near(im, colour, TOL_LOOSE))


def normalize(im):
    """Repaint the backdrop to TARGET, leaving the product and its shadow alone."""
    im = im.convert("RGB")
    colour = backdrop_colour(im)
    out = im.copy()
    out.paste(Image.new("RGB", im.size, TARGET), (0, 0), backdrop_mask(im, colour).convert("L"))
    return out


UNIFORM = 0.95  # this much of the border on one colour means a sweep, not a scene


def border_uniformity(im):
    """(fraction of the border on its dominant colour, that colour).

    A studio sweep is the same colour all the way round; a scene, or a subject
    that runs off the edge of the frame, is not. Measured on SNAP's photography
    the two do not overlap: flat sweeps score 1.00, a model whose shoulder
    reaches the frame edge scores 0.71-0.84.
    """
    w, h = im.size
    step = max(1, min(w, h) // 64)
    edge = []
    for x in range(0, w, step):
        edge += [im.getpixel((x, 2)), im.getpixel((x, h - 3))]
    for y in range(0, h, step):
        edge += [im.getpixel((2, y)), im.getpixel((w - 3, y))]
    dominant = Counter(edge).most_common(1)[0][0]
    hit = sum(1 for c in edge if all(abs(c[i] - dominant[i]) <= TOL for i in range(3)))
    return hit / len(edge), dominant


def is_studio(im):
    """Is the product standing on a flat neutral sweep — of ANY shade?

    Deliberately a different question from `needs_normalizing`, which asks the
    shop's: "does this fail to match the tile?". A cutout asks whether there is
    a backdrop at all, so it answers yes to #e6e6e6 — invisible on a tile
    painted to match it, a grey box on white paper — and yes to the flat BLACK
    sweep SNAP shoots its plates and barbells on, which the shop's lightness
    floor rejects and a white catalogue page renders as a black box.

    Uniformity replaces that lightness floor, because "flat all the way round"
    is what actually distinguishes a sweep from a room.
    """
    if im.mode != "RGB":
        im = im.convert("RGB")
    uniformity, colour = border_uniformity(im)
    r, g, b = colour
    if max(abs(r - g), abs(g - b), abs(r - b)) > COLOR_SPREAD:
        return False  # coloured backdrop (turf, a gym floor) - intentional
    return uniformity >= UNIFORM


def cutout(im):
    """Knock the studio backdrop out to transparency, returning RGBA.

    For assets that have to sit on a page whose colour we do not control. The
    mask is the same one `normalize` fills, so what survives here is exactly
    what survives there — lettering, chrome highlights and the product's own
    shadow all stay, and the dilation that swallows the anti-aliased fringe is
    what keeps a pale halo from being left behind on a dark page.
    """
    im = im.convert("RGB")
    out = im.convert("RGBA")
    if not is_studio(im):
        return out  # in-scene or coloured: there is no backdrop to remove
    alpha = ImageChops.invert(backdrop_mask(im, backdrop_colour(im)).convert("L"))
    out.putalpha(alpha)
    return out


def residual(im, colour):
    """Fraction of the image left at the old backdrop colour, for reporting.

    Pixels that are ALSO within tolerance of TARGET do not count: an off-shade
    backdrop can sit within TOL of the tile grey it was repainted to, and a
    naive test then reports a perfectly normalized image as entirely unfilled.
    """
    small = im.convert("RGB").resize((160, 160))
    px = list(small.getdata())
    hit = sum(
        1
        for c in px
        if all(abs(c[i] - colour[i]) <= TOL for i in range(3))
        and not all(abs(c[i] - TARGET[i]) <= MATCH_TOLERANCE for i in range(3))
    )
    return hit / len(px)
