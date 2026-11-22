#!/usr/bin/env python3
"""Original ANA standard passenger-scheme artwork for the FlightGear 747-400.

Run: python3 assets/aircraft/generate_ana_747.py (Pillow and NumPy required).
Inputs: assets/aircraft/BLANK.png, under the aircraft's accompanying licence.
Outputs: assets/aircraft/ANA.png and assets/livery-logos/ana-blue.png.
The artwork is drawn here, not traced from or composited with a photograph.
ANA and its marks are trademarks. This is an approximation, not an official logo.

Visual reference, a regular passenger 747-400 in the blue scheme (JA8958):
https://commons.wikimedia.org/wiki/File:ANA_B747-400(JA8958)_(4493576272).jpg
No registration is painted: this UV model is not a particular aircraft. Nacelles
and wings also use other textures; this atlas cannot repaint those components.
The first body island points left; the second points right. The fin islands
both map forward to left, but are seen from opposite sides, so the second fin's
lettering must be reversed in the atlas. Both body titles remain readable.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, PngImagePlugin

ROOT = Path(__file__).resolve().parents[2]
AIRCRAFT = ROOT / 'assets/aircraft'
LOGOS = ROOT / 'assets/livery-logos'
SIZE = (4096, 1024)
SW, SH, LOWER_Y = 2358, 280, 282
BLUE = (17, 44, 133)
CYAN = (0, 152, 213)
WHITE = (250, 251, 250)
BELLY = (216, 222, 224)


def ana_mask():
    """Original geometric italic ANA approximation, transparent letter mask."""
    scale = 4
    im = Image.new('L', (430 * scale, 110 * scale))
    d = ImageDraw.Draw(im)
    def poly(points, fill=255):
        # A common rightward italic shear makes the three letters coherent.
        d.polygon([(round((x + (110-y)*.18)*scale), round(y*scale))
                   for x, y in points], fill=fill)
    def a(x):
        poly([(x,110),(x+40,0),(x+79,0),(x+108,110),
              (x+78,110),(x+72,83),(x+35,83),(x+25,110)])
        poly([(x+45,58),(x+67,58),(x+60,23)], 0)
    a(0)
    poly([(116,110),(116,0),(149,0),(187,70),(187,0),
          (215,0),(215,110),(183,110),(144,40),(144,110)])
    a(231)
    return im.crop((0, 0, 370*scale, 110*scale))


def wordmark(color, slash=False):
    mask = ana_mask()
    w = mask.width + (38*4 if slash else 0)
    im = Image.new('RGBA', (w, mask.height))
    im.paste(color + (255,), (0, 0), mask)
    if slash:
        d = ImageDraw.Draw(im)
        d.polygon([(352*4,110*4), (377*4,0), (411*4,0), (386*4,110*4)],
                  fill=CYAN+(255,))
    return im


def put_mark(image, mark, box, flip=False, angle=0):
    x, y, w, h = box
    m = mark.resize((round(w*4), round(h*4)), Image.Resampling.LANCZOS)
    if flip:
        m = m.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if angle:
        m = m.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    m = m.resize((round(m.width/4), round(m.height/4)), Image.Resampling.LANCZOS)
    image.alpha_composite(m, (round(x-m.width/2), round(y-m.height/2)))


def body(right=False):
    """Draw broad continuous bands in nose-left coordinates, then reverse UVs."""
    im = Image.new('RGB', (SW, SH), WHITE)
    d = ImageDraw.Draw(im)
    # The blue belt climbs towards the fin and meets the aft fin-root paint;
    # the main deck windows are restored from the passenger template afterward.
    upper = [(0,162),(260,161),(580,157),(1000,150),(1450,137),
             (1750,113),(2050,70),(2357,12)]
    d.polygon(upper + [(2357,187),(0,187)], fill=BLUE)
    # Cyan lower edge grows from almost nothing at the nose to a ribbon aft.
    d.polygon([(0,187),(460,187),(900,186),(1500,184),(2357,181),
               (2357,205),(1500,200),(900,195),(460,191),(0,188)], fill=CYAN)
    d.polygon([(0,188),(460,191),(900,195),(1500,200),(2357,205),
               (2357,280),(0,280)], fill=BELLY)
    if right:
        im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return im


def restore_details(paint, blank):
    """Restore glazing/door outlines and a pale edge on dark painted glass."""
    arr = np.asarray(paint).astype(np.float32).copy()
    rgb = np.asarray(blank).astype(np.int16)
    gray = np.asarray(blank.convert('L')).astype(np.float32)
    neutral = rgb.max(axis=2) - rgb.min(axis=2) < 14
    strength = np.clip((255-gray)/150, 0, 1) * neutral
    dark_paint = arr.mean(axis=2) < 120
    glass = (gray < 165) & neutral
    expanded = np.asarray(Image.fromarray((glass*255).astype('uint8')).filter(ImageFilter.MaxFilter(3))) > 0
    rim = expanded & ~glass & dark_paint
    arr[rim] = arr[rim]*.25 + np.array((188,205,216))*.75
    line = (gray > 165) & (gray < 250)
    target = np.empty_like(arr)
    target[:] = (26,35,43)
    target[line & dark_paint] = (192,205,213)
    a = strength[:, :, None]
    return Image.fromarray(np.clip(arr*(1-a) + target*a, 0, 255).astype('uint8'))


def main():
    blank = Image.open(AIRCRAFT / 'BLANK.png').convert('RGB')
    if blank.size != SIZE:
        raise ValueError('BLANK.png must be the 4096x1024 747 atlas')
    image = blank.copy()
    for y, right in ((0, False), (LOWER_Y, True)):
        side = body(right)
        side = restore_details(side, blank.crop((0,y,SW,y+SH)))
        image.paste(side, (0,y))
    image = image.convert('RGBA')
    mark = wordmark(BLUE, slash=True)
    # Forward ANA, between the main and upper deck windows on each side.
    for x, y in ((444,108), (1914,LOWER_Y+108)):
        put_mark(image, mark, (x,y,138,33))

    d = ImageDraw.Draw(image)
    for dx in (0, 575):
        # Overpaint the whole island for safe texture-filter bleed at UV seams.
        d.rectangle((dx,630,dx+550,958), fill=BLUE+(255,))
        # Narrow cyan rear edge of the fin, aligned with the swept rudder.
        d.polygon([(dx+491,638),(dx+520,638),(dx+404,958),(dx+375,958)],
                  fill=CYAN+(255,))
    white_mark = wordmark(WHITE)
    put_mark(image, white_mark, (329,790,240,64), angle=31)
    put_mark(image, white_mark, (904,790,240,64), flip=True, angle=31)
    # Both islands map the same physical fore-aft direction; reversing only the
    # letters makes them readable when the fin is viewed from the other side.
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text('Comment', 'ANA standard passenger 747-400 approximation; original artwork on FlightGear BLANK UV atlas; no specific registration.')
    image.convert('RGB').save(AIRCRAFT / 'ANA.png', pnginfo=metadata, optimize=True)
    LOGOS.mkdir(parents=True, exist_ok=True)
    card = wordmark(BLUE, slash=True)
    card.thumbnail((800, 230), Image.Resampling.LANCZOS)
    card.save(LOGOS / 'ana-blue.png', optimize=True)
    print('Wrote assets/aircraft/ANA.png and assets/livery-logos/ana-blue.png')


if __name__ == '__main__':
    main()
