#!/usr/bin/env python3
"""Make the 747-400 interpretation of Lufthansa's 100-year scheme.

Inputs: FlightGear BLANK.png and DLH.png in assets/aircraft; Pillow and NumPy;
Liberation Sans fonts from the OS. No network access or downloaded imagery.
Run from any directory: python3 tools/generate_lufthansa_100.py

The reference is the D-ABYN 747-8, not this 747-400. In particular, its
separately mapped wings and engines cannot be repainted by a fuselage livery.
The artwork is hand drawn; the small crane is extracted from the existing DLH
texture, whose licence accompanies the aircraft assets.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "aircraft"
BLANK = ASSETS / "BLANK.png"
DLH = ASSETS / "DLH.png"
OUTPUT = ASSETS / "DLH100.png"
FONT = Path('/usr/share/fonts/liberation-sans/LiberationSans-Bold.ttf')
NAVY = (12, 24, 53)
WHITE = (239, 242, 240)
SCALE = 2
# Both strips use the same height and longitudinal origin. The lower strip
# is mirrored in U, NOT in V: its nose is at the right of the atlas.
SW, SH, LOWER_Y = 2354, 280, 282


def cubic(a, b, c, d, steps=32):
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        out.append(tuple((1-t)**3*a[k] + 3*(1-t)**2*t*b[k] +
                         3*(1-t)*t*t*c[k] + t**3*d[k] for k in (0, 1)))
    return out


def P(points):
    return [(round(x*SCALE), round(y*SCALE)) for x, y in points]


def crane_mask(dlh):
    # DLH's port-side tail contains a navy crane on a yellow disc. Isolate
    # the bird, not the circular surround; it is reused at three scales.
    box = (310, 772, 440, 832)
    rgb = np.asarray(dlh.crop(box).convert('RGB')).astype(np.int16)
    yellow = np.clip((rgb[:, :, 0] - rgb[:, :, 2] - 25) * 2, 0, 255)
    bird = Image.fromarray((255 - yellow).astype('uint8'), 'L')
    # The disc's outer ring clips the crop corners. Remove all bright
    # components touching the crop edge, keeping the connected crane.
    binary = bird.point(lambda p: 255 if p > 25 else 0)
    for x in range(binary.width):
        ImageDraw.floodfill(binary, (x, 0), 0)
        ImageDraw.floodfill(binary, (x, binary.height - 1), 0)
    for y in range(binary.height):
        ImageDraw.floodfill(binary, (0, y), 0)
        ImageDraw.floodfill(binary, (binary.width - 1, y), 0)
    return ImageChops.multiply(bird, binary)


def put_bird(im, mask, box, color, mirror=False):
    x, y, w, h = box
    m = mask.resize((int(w*SCALE), int(h*SCALE)), Image.Resampling.LANCZOS)
    if mirror:
        m = m.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    im.paste(color, (int(x*SCALE), int(y*SCALE)), m)


def centered_text(draw, text, box, fill, font_size):
    x, y, w, h = box
    f = ImageFont.truetype(str(FONT), font_size*SCALE)
    bounds = draw.textbbox((0, 0), text, font=f, stroke_width=0)
    draw.text((int((x + w/2)*SCALE - (bounds[2]-bounds[0])/2 - bounds[0]),
               int((y + h/2)*SCALE - (bounds[3]-bounds[1])/2 - bounds[1])),
              text, font=f, fill=fill)


def make_side(bird, right=False):
    """Return a side in readable atlas orientation (port nose left)."""
    im = Image.new('RGB', (SW*SCALE, SH*SCALE), NAVY)
    d = ImageDraw.Draw(im)
    # Swept white crane: long beak over the upper deck, a hooked negative
    # space, and the large body tapering into the white wing-root fairing.
    # These are curves, not a stretched circular logo or a flat stripe.
    pts = [(400, 22), (552, 37), (704, 13), (918, 28), (1160, 53), (1355, 76)]
    pts += cubic(pts[-1], (1450, 87), (1502, 84), (1524, 68))
    pts += cubic(pts[-1], (1690, 72), (1845, 88), (1935, 90))
    pts += cubic(pts[-1], (1805, 94), (1730, 145), (1774, 185))
    pts += cubic(pts[-1], (1808, 217), (1900, 247), (2040, 279))
    pts += [(1130, 279)]
    pts += cubic(pts[-1], (1080, 239), (1010, 211), (908, 189))
    pts += cubic(pts[-1], (720, 145), (530, 98), (442, 70))
    d.polygon(P(pts), fill=WHITE)
    # Blue notch is the gap between the crane's swept feathers.
    notch = [(922, 66), (1258, 103), (1240, 122), (914, 83)]
    d.polygon(P(notch), fill=NAVY)

    if right:
        im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    d = ImageDraw.Draw(im)
    # Semi-transparent silver numerals, like the photographed special scheme.
    # Text is drawn after the UV mirror, so both sides are readable.
    overlay = Image.new('RGBA', im.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    if not right:
        centered_text(od, '100', (1390, 86, 420, 160), (115, 135, 148, 180), 170)
        put_bird(overlay, bird, (1405, 78, 118, 54), (115, 135, 148, 200))
        label_x = 338
    else:
        centered_text(od, '1926 / 2026', (525, 103, 665, 125), (115, 135, 148, 190), 94)
        label_x = 1730
    im = Image.alpha_composite(im.convert('RGBA'), overlay).convert('RGB')
    d = ImageDraw.Draw(im)
    # Small forward branding, avoiding the first passenger door. There is
    # deliberately no registration or aircraft name on this fictional -400.
    d.text(P([(label_x, 170)])[0], 'Lufthansa', font=ImageFont.truetype(str(FONT), 34*SCALE), fill=WHITE)
    d.text(P([(label_x, 207)])[0], 'Boeing 747-400', font=ImageFont.truetype(str(FONT), 11*SCALE), fill=WHITE)
    nose_x = 193 if not right else 2071
    d.ellipse(P([(nose_x-4, 78), (nose_x+41, 106)]), outline=WHITE, width=SCALE)
    put_bird(im, bird, (nose_x, 84, 37, 17), WHITE, mirror=right)
    return im.resize((SW, SH), Image.Resampling.LANCZOS)


def apply_details(side, source):
    """Restore BLANK's windows, passenger doors and cargo-door outlines.

    Dark glass is preserved, while thin grey outlines change to a pale line
    over navy paint. Thus details stay legible on both light and dark paint.
    """
    arr = np.asarray(side).astype(np.float32).copy()
    source_rgb = np.asarray(source).astype(np.int16)
    gray = np.asarray(source.convert('L')).astype(np.float32)
    strength = np.clip((255 - gray) / 150, 0, 1)
    # BLANK's blue atlas background is not a panel line; leave it as bleed.
    strength[source_rgb[:, :, 2] > source_rgb[:, :, 0] + 15] = 0
    # Add a narrow light rim around the original dark glazing when it falls
    # on navy. The existing glass remains dark, not a row of white squares.
    is_dark_paint = np.mean(arr, axis=2) < 100
    glass = ((gray < 165) & (source_rgb[:, :, 2] <= source_rgb[:, :, 0] + 15))
    expanded = np.asarray(Image.fromarray((glass * 255).astype('uint8')).filter(ImageFilter.MaxFilter(3))) > 0
    rim = expanded & ~glass & is_dark_paint
    arr[rim] = arr[rim] * 0.35 + np.array((178, 191, 199)) * 0.65
    # Window centres are darker than the fine door outlines on BLANK.
    is_line = (gray > 165) & (gray < 250)
    target = np.empty_like(arr)
    target[:] = (22, 32, 42)
    target[is_line & is_dark_paint] = (180, 191, 197)
    alpha = strength[:, :, None]
    result = np.clip(arr*(1-alpha) + target*alpha, 0, 255).astype('uint8')
    return Image.fromarray(result, 'RGB')


def main():
    if not FONT.is_file():
        raise SystemExit(f'Missing font: {FONT} (install Liberation Sans)')
    blank, dlh = Image.open(BLANK).convert('RGB'), Image.open(DLH).convert('RGB')
    if blank.size != (4096, 1024) or dlh.size != blank.size:
        raise SystemExit('Expected BLANK and DLH textures of 4096x1024')
    bird = crane_mask(dlh)
    out = dlh.copy()  # retains all non-fuselage islands and their boundaries
    for y, right in ((0, False), (LOWER_Y, True)):
        side = make_side(bird, right)
        side = apply_details(side, blank.crop((0, y, SW, y+SH)))
        out.paste(side, (0, y))

    # Repaint both tail islands, retaining their silhouettes/UVs. The older
    # yellow disc becomes today's white crane and a fine white ring.
    pix = np.asarray(out).copy()
    for x0, x1 in ((0, 550), (560, 1120)):
        region = pix[630:950, x0:x1]
        # Original DLH tail navy and its yellow disc, not blue atlas background.
        is_tail = ((region[:, :, 2] < 100) & (region[:, :, 0] < 55))
        is_gold = (region[:, :, 0] > 170) & (region[:, :, 1] > 85) & (region[:, :, 2] < 100)
        region[is_tail | is_gold] = NAVY
    # DLH has old fleet-code letters at the top of each fin. They are not
    # applicable to this fictional adaptation; do not imply a registration.
    for dx in (0, 578):
        pix[660:683, 445+dx:479+dx] = NAVY
    out = Image.fromarray(pix, 'RGB')
    tail = Image.new('RGBA', (4096*SCALE, 1024*SCALE), (0, 0, 0, 0))
    td = ImageDraw.Draw(tail)
    for cx in (372, 950):
        td.ellipse(P([(cx-77, 720), (cx+77, 874)]), outline=WHITE+(255,), width=3*SCALE)
        put_bird(tail, bird, (cx-60, 773, 120, 55), WHITE+(255,))
    out = Image.alpha_composite(out.convert('RGBA'), tail.resize(out.size, Image.Resampling.LANCZOS)).convert('RGB')
    out.save(OUTPUT, 'PNG', optimize=True)
    print(f'Wrote {OUTPUT} ({out.width}x{out.height})')


if __name__ == '__main__':
    main()
