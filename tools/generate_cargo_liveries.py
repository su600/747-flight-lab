#!/usr/bin/env python3
"""Generate original FedEx and SF Airlines 747-400 cargo liveries.

Usage: python3 tools/generate_cargo_liveries.py
Requires Python 3, Pillow, fontconfig, DejaVu Sans and Noto Sans CJK SC (or
compatible installed fonts). Inputs are only the project's GPL-2.0 BLANK.png
and BOE.png UV atlases. Every new mark is drawn from original vector shapes and
system fonts; no downloaded logos, photographs, or other unlicensed imagery.
The carrier names and brand colors are used for identification; this artwork
is an unofficial fan adaptation and does not imply carrier endorsement. The
provided photographs are visual references only; no reference pixels are used.

Atlas: 4096 x 1024 pixels. The two fuselage shells occupy y=0..280 and
282..562 (the lower shell is U-reversed); both tail islands are at y=630..955.
The fin's two visible sides use separate islands: x=0..550 and x=578..1128.
Their outward-facing UV projections have opposite horizontal reading directions,
so the second island's tail lettering is mirrored in the atlas artwork.
The script confines paint to the existing atlas islands and restores the
project's window, door, and panel linework after painting.
"""
from pathlib import Path
import argparse
import ast
import re
import subprocess

from PIL import Image, ImageChops, ImageDraw, ImageFont, PngImagePlugin

ROOT = Path(__file__).resolve().parents[1]
AIRCRAFT = ROOT / 'assets' / 'aircraft'
LOGOS = ROOT / 'assets' / 'livery-logos'
SIZE = (4096, 1024)
BG = (36, 67, 117)
WHITE = (248, 247, 245)
FEDEX_PURPLE = (77, 20, 140)
FEDEX_ORANGE = (255, 102, 0)
SF_RED = (200, 16, 46)
SF_CHARCOAL = (40, 42, 45)


def system_font(pattern, size):
    """Resolve an installed font rather than bundling a font asset."""
    result = subprocess.check_output(
        ['fc-match', '-f', '%{file}\n%{index}', pattern], text=True
    ).splitlines()
    return ImageFont.truetype(result[0], size, index=int(result[1] or 0))


LATIN = system_font('DejaVu Sans:style=Bold', 12)
LATIN_REGULAR = system_font('DejaVu Sans', 12)
CJK = system_font('Noto Sans CJK SC:style=Bold', 12)


def fitted_font(draw, text, font, max_width, max_height, start_size):
    """Return a system font sized to fit a text box without stretching it."""
    for size in range(start_size, 7, -1):
        candidate = ImageFont.truetype(font.path, size, index=getattr(font, 'index', 0))
        box = draw.textbbox((0, 0), text, font=candidate)
        if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
            return candidate
    return ImageFont.truetype(font.path, 8, index=getattr(font, 'index', 0))


def draw_text_centered(draw, xy, text, font, fill, max_width=None, max_height=None):
    x, y = xy
    if max_width is not None and max_height is not None:
        font = fitted_font(draw, text, font, max_width, max_height, font.size)
    box = draw.textbbox((0, 0), text, font=font)
    draw.text((x - (box[2] - box[0]) / 2 - box[0],
               y - (box[3] - box[1]) / 2 - box[1]), text, font=font, fill=fill)


def draw_tail_mark(paint, offset, text, font):
    """Place readable FedEx lettering on both separately mapped fin sides."""
    patch = Image.new('RGBA', (240, 120), (0, 0, 0, 0))
    draw = ImageDraw.Draw(patch)
    width = draw.textlength('Fed', font=font) + draw.textlength('Ex', font=font)
    left = (240 - width) / 2
    draw.text((left, 22), 'Fed', font=font, fill=(255, 255, 255, 255))
    draw.text((left + draw.textlength('Fed', font=font), 22), 'Ex', font=font, fill=(*FEDEX_ORANGE, 255))
    small = ImageFont.truetype(LATIN.path, 20, index=getattr(LATIN, 'index', 0))
    draw.text((left, 86), 'Express', font=small, fill=(255, 255, 255, 255))
    if offset == 578:
        patch = patch.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    paint.paste(patch, (offset + 186, 808), patch)


def draw_tail_roundel(paint, offset):
    """Original white SF roundel, handed per the two independent vstab UVs."""
    patch = Image.new('RGBA', (144, 144), (0, 0, 0, 0))
    d = ImageDraw.Draw(patch)
    d.ellipse((5, 5, 139, 139), fill=SF_CHARCOAL, outline=(255, 255, 255, 255), width=7)
    d.ellipse((14, 14, 130, 130), outline=(255, 255, 255, 255), width=2)
    sf = ImageFont.truetype(LATIN.path, 55, index=getattr(LATIN, 'index', 0))
    draw_text_centered(d, (72, 72), 'SF', sf, (255, 255, 255, 255))
    # The second island is the z-negative face and projects horizontally
    # reversed from outside; mirror the artwork there, not the whole fin.
    if offset == 578:
        patch = patch.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    paint.paste(patch, (offset + 288, 718), patch)


def neutral_islands(blank, boxes):
    """Mask non-background atlas pixels, restricted to listed UV zones."""
    background = Image.new('RGB', SIZE, BG)
    mask = ImageChops.difference(blank, background).convert('L')
    mask = mask.point(lambda p: 255 if p > 12 else 0)
    zones = Image.new('L', SIZE, 0)
    d = ImageDraw.Draw(zones)
    for box in boxes:
        d.rectangle(box, fill=255)
    return ImageChops.multiply(mask, zones)


def main_deck_window_pixels(blank):
    """Return only original main-deck window pixels, not a row-wide band.

    Use aircraft-lighting.js as the authoritative set of 747 UV centers. The
    small per-window footprints follow the measured 10x13 px shapes in BLANK;
    doors and other linework between those footprints remain untouched.
    """
    source = (ROOT / 'src' / 'aircraft-lighting.js').read_text(encoding='utf-8')
    match = re.search(r'const WINDOW_ROWS=(\[.*?\]);', source, re.S)
    if not match:
        raise RuntimeError('Could not read the 747 WINDOW_ROWS UV centers')
    rows = ast.literal_eval(match.group(1))
    zones = Image.new('L', SIZE, 0)
    draw = ImageDraw.Draw(zones)
    count = 0
    for y, centers in rows:
        if y not in (150, 430):
            continue
        for x in centers:
            # Measured non-white window pixels occupy about x-5..x+5,
            # y-4..y+7. Add one pixel for antialiasing without masking the row.
            draw.rectangle((x - 6, y - 6, x + 6, y + 8), fill=255)
            count += 1
    if count < 100:
        raise RuntimeError(f'Unexpected main-deck window count: {count}')
    # Exclude only non-white source pixels in the small window footprints. The
    # surrounding fuselage stays the newly painted body color.
    source_features = blank.convert('L').point(lambda p: 255 if p < 250 else 0)
    return ImageChops.multiply(zones, source_features)


def restore_details(image, blank, island_mask, remove_main_deck_windows=False):
    """Bring back neutral panel/door detail; optionally omit passenger windows."""
    red, green, blue = blank.split()
    chroma = ImageChops.lighter(
        ImageChops.difference(red, green), ImageChops.difference(green, blue)
    )
    grayscale = chroma.point(lambda p: 255 if p < 12 else 0)
    darkness = blank.convert('L').point(lambda p: max(0, min(255, (250 - p) * 4)))
    detail = ImageChops.multiply(ImageChops.multiply(grayscale, darkness), island_mask)
    if remove_main_deck_windows:
        detail = ImageChops.multiply(detail, ImageChops.invert(main_deck_window_pixels(blank)))
    return Image.composite(blank, image, detail)


def draw_fedex_wordmark(draw, center_x, top):
    # Keep the split-color wordmark in the clear belt between cabin-window rows.
    font = ImageFont.truetype(LATIN.path, 66, index=getattr(LATIN, 'index', 0))
    a, b = 'Fed', 'Ex'
    width = draw.textlength(a, font=font) + draw.textlength(b, font=font)
    x = center_x - width / 2
    draw.text((x, top), a, font=font, fill=FEDEX_PURPLE)
    draw.text((x + draw.textlength(a, font=font), top), b, font=font, fill=FEDEX_ORANGE)
    small = ImageFont.truetype(LATIN.path, 20, index=getattr(LATIN, 'index', 0))
    draw.text((x, top + 60), 'Express', font=small, fill=FEDEX_PURPLE)


def paint_fedex_body(image, hull_mask, blank):
    # Adapt the real 777F's mostly white fuselage rather than inventing a
    # purple belly or orange cheatline. This 747 combination is illustrative.
    paint = Image.new('RGB', SIZE, WHITE)
    image = Image.composite(paint, image, hull_mask)
    d = ImageDraw.Draw(image)
    draw_fedex_wordmark(d, 880, 78)
    draw_fedex_wordmark(d, 1477, 360)
    return restore_details(image, blank, hull_mask, remove_main_deck_windows=True)


def draw_tracked(draw, text, x, y, font, fill, tracking=4):
    for char in text:
        draw.text((x, y), char, font=font, fill=fill)
        x += draw.textlength(char, font=font) + tracking


def draw_sf_roundel(draw, center, radius, dark_mark=False):
    cx, cy = center
    foreground = (255, 255, 255) if dark_mark else SF_CHARCOAL
    background = SF_CHARCOAL if dark_mark else WHITE
    draw.ellipse((cx-radius, cy-radius, cx+radius, cy+radius),
                 fill=background, outline=foreground, width=5)
    draw.ellipse((cx-radius+8, cy-radius+8, cx+radius-8, cy+radius-8),
                 outline=foreground, width=2)
    font = ImageFont.truetype(LATIN.path, round(radius * 1.12), index=getattr(LATIN, 'index', 0))
    draw_text_centered(draw, center, 'SF', font, foreground)


def draw_sf_wordmark(draw, left, top, roundel_before=False):
    """Original AIRLINES / 顺丰航空 lock-up and circular SF mark.

    On the nose-left UV shell the nose is toward decreasing U, so the roundel
    belongs before the words. The lower, nose-right shell keeps the roundel after.
    """
    en = ImageFont.truetype(LATIN.path, 30, index=getattr(LATIN, 'index', 0))
    cn = fitted_font(draw, '顺丰航空', CJK, 196, 38, 34)
    if roundel_before:
        draw_sf_roundel(draw, (left - 65, top + 32), 35)
    draw_tracked(draw, 'AIRLINES', left, top, en, SF_CHARCOAL, tracking=4)
    draw.text((left, top + 23), '顺丰航空', font=cn, fill=SF_CHARCOAL)
    if not roundel_before:
        draw_sf_roundel(draw, (left + 270, top + 32), 35)


def paint_sf_body(image, hull_mask, blank):
    paint = Image.new('RGB', SIZE, WHITE)
    d = ImageDraw.Draw(paint)
    # Broad red sweep occupies the rear fuselage instead of hugging only the
    # belly. At the lower-shell cargo-door UVs it stays above the door outline.
    ribbon = [(760, 244), (1100, 238), (1450, 218), (1760, 186),
              (2050, 145), (2357, 108), (2357, 140), (2050, 180),
              (1760, 218), (1450, 249), (1100, 265), (760, 274)]
    for y, mirror in ((0, False), (282, True)):
        def side(points):
            return [(2357 - x if mirror else x, y + dy) for x, dy in points]
        d.polygon(side(ribbon), fill=SF_RED)
        # The 747 lower cargo-door UV is y≈497..525 (local y≈215..243).
        # Put all belly pinstripes below it so door contours cannot form dark
        # vertical intersections when the texture wraps around the hull.
        d.line(side([(0, 256), (1400, 256), (1900, 252), (2040, 246),
                     (2200, 216), (2357, 190)]),
               fill=SF_CHARCOAL, width=6)
        d.line(side([(0, 264), (1440, 264), (1900, 260), (2040, 254),
                     (2200, 228), (2357, 202)]),
               fill=(115, 119, 122), width=4)
        d.line(side([(0, 272), (1500, 272), (1930, 268), (2070, 261),
                     (2240, 238), (2357, 212)]),
               fill=SF_CHARCOAL, width=3)
    image = Image.composite(paint, image, hull_mask)
    d = ImageDraw.Draw(image)
    # Keep both lock-ups ahead of cargo doors; lower-shell text is independently
    # typeset because its UV island runs in the opposite longitudinal direction.
    # Nose-left shell: roundel forward of the lettering. Nose-right shell:
    # lettering followed by the roundel, also forward-facing after UV mapping.
    draw_sf_wordmark(d, 650, 72, roundel_before=True)
    draw_sf_wordmark(d, 1390, 354)
    return restore_details(image, blank, hull_mask, remove_main_deck_windows=True)


def paint_tail(image, blank, code):
    tail_mask = neutral_islands(blank, [(0, 630, 550, 956), (575, 630, 1125, 956)])
    paint = Image.new('RGB', SIZE, BG)
    d = ImageDraw.Draw(paint)
    for offset in (0, 578):
        fin = [(offset + 4, 955), (offset + 73, 903),
               (offset + 393, 644), (offset + 548, 644),
               (offset + 423, 955)]
        if code == 'fedex':
            d.polygon(fin, fill=FEDEX_PURPLE)
            tail_font = ImageFont.truetype(LATIN.path, 48, index=getattr(LATIN, 'index', 0))
            draw_tail_mark(paint, offset, 'FedEx', tail_font)
        else:
            d.polygon(fin, fill=SF_CHARCOAL)
            # Silver and red slashes echo the real tail-to-fuselage sweep.
            d.polygon([(offset + 18, 927), (offset + 83, 917),
                       (offset + 414, 650), (offset + 438, 650),
                       (offset + 112, 934)], fill=(144, 147, 149))
            d.polygon([(offset + 30, 936), (offset + 91, 926),
                       (offset + 419, 656), (offset + 435, 656),
                       (offset + 124, 940)], fill=SF_RED)
            draw_tail_roundel(paint, offset)
    return Image.composite(paint, image, tail_mask)


def paint_engine_cowls(image, blank, code):
    mask = neutral_islands(blank, [(2405, 25, 2700, 222), (2733, 25, 3019, 222)])
    paint = Image.new('RGB', SIZE, WHITE)
    d = ImageDraw.Draw(paint)
    for left, right in ((2405, 2700), (2733, 3019)):
        if code == 'fedex':
            d.rectangle((left, 25, right, 220), fill=WHITE)
        else:
            d.rectangle((left, 25, right, 220), fill=SF_CHARCOAL)
            d.rectangle((left, 133, right, 139), fill=(165, 168, 170))
            d.rectangle((left, 140, right, 147), fill=SF_RED)
    image = Image.composite(paint, image, mask)
    return restore_details(image, blank, mask)


def paint_winglets(image, boe, code):
    """Tint only the white, mapped winglet faces from the project's BOE atlas."""
    box = (3068, 0, 3438, 685)
    source = boe.crop(box).convert('RGB')
    red, green, blue = source.split()
    spread = ImageChops.lighter(ImageChops.difference(red, green), ImageChops.difference(green, blue))
    face = spread.point(lambda p: 255 if p < 24 else 0)
    face = ImageChops.multiply(face, red.point(lambda p: 255 if p > 205 else 0))
    color = FEDEX_PURPLE if code == 'fedex' else SF_CHARCOAL
    tint = Image.new('RGB', source.size, color)
    source = Image.composite(tint, source, face)
    image.paste(source, box[:2])
    return image


def make_card_logo(code, path):
    size = 512
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    if code == 'fedex':
        # Original compact wordmark on white, with a matching purple/orange rail.
        d.rounded_rectangle((27, 105, 485, 405), radius=34, fill=WHITE)
        d.rectangle((62, 357, 450, 377), fill=FEDEX_PURPLE)
        font = ImageFont.truetype(LATIN.path, 113, index=getattr(LATIN, 'index', 0))
        word = 'Fed'
        next_word = 'Ex'
        total = d.textlength(word, font=font) + d.textlength(next_word, font=font)
        x = (size - total) / 2
        d.text((x, 178), word, font=font, fill=FEDEX_PURPLE)
        d.text((x + d.textlength(word, font=font), 178), next_word, font=font, fill=FEDEX_ORANGE)
        label = ImageFont.truetype(LATIN.path, 34, index=getattr(LATIN, 'index', 0))
        draw_text_centered(d, (256, 333), 'EXPRESS', label, FEDEX_PURPLE)
    else:
        # Original circular, black-and-white SF roundel; no red square or
        # copied corporate emblem. Carrier wording is set separately below.
        d.ellipse((48, 24, 464, 440), fill=SF_CHARCOAL)
        d.ellipse((72, 48, 440, 416), outline=(255, 255, 255, 255), width=11)
        d.ellipse((94, 70, 418, 394), outline=(255, 255, 255, 220), width=3)
        sf = ImageFont.truetype(LATIN.path, 132, index=getattr(LATIN, 'index', 0))
        draw_text_centered(d, (256, 193), 'SF', sf, (255, 255, 255))
        cn = fitted_font(d, '顺丰航空', CJK, 285, 48, 40)
        draw_text_centered(d, (256, 306), '顺丰航空', cn, (255, 255, 255))
        en = ImageFont.truetype(LATIN.path, 24, index=getattr(LATIN, 'index', 0))
        draw_text_centered(d, (256, 362), 'AIRLINES', en, (255, 255, 255))
    image.save(path, optimize=True)


def generate(code, blank, boe, make_logos=True):
    image = boe.copy().convert('RGB')
    hull_mask = neutral_islands(blank, [(0, 0, 2357, 280), (0, 282, 2357, 562)])
    if code == 'fedex':
        image = paint_fedex_body(image, hull_mask, blank)
    else:
        image = paint_sf_body(image, hull_mask, blank)
    image = paint_tail(image, blank, code)
    image = paint_engine_cowls(image, blank, code)
    image = paint_winglets(image, boe, code)

    metadata = PngImagePlugin.PngInfo()
    carrier = 'FedEx Express' if code == 'fedex' else 'SF Airlines / 顺丰航空'
    metadata.add_text(
        'Comment',
        f'Unofficial original-art 747-400 cargo livery adaptation for {carrier}. '
        'UV base: this project BLANK.png and BOE.png (FlightGear model assets, GPL-2.0); '
        'all new lettering and graphic shapes were drawn by this generator. No carrier endorsement.'
    )
    # The versioned FedEx URL prevents browsers from retaining the older atlas.
    destination = AIRCRAFT / ('fedex-v2.png' if code == 'fedex' else 'sf.png')
    image.save(destination, 'PNG', pnginfo=metadata, optimize=True)
    if image.size != SIZE or image.getpixel((4095, 1023)) != BG:
        raise RuntimeError(f'{code}: invalid atlas dimensions or modified UV background')
    changed = ImageChops.difference(image, boe.convert('RGB')).getbbox()
    if not changed:
        raise RuntimeError(f'{code}: generator produced no painted atlas pixels')
    print(f'{destination}: {image.width}x{image.height} RGB; UV artwork bounds {changed}')
    if make_logos:
        logo = LOGOS / ('fedex.png' if code == 'fedex' else 'sf-express.png')
        make_card_logo(code, logo)
        print(f'{logo}: {Image.open(logo).size} RGBA')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--atlases-only', action='store_true',
                        help='regenerate only the aircraft UV atlases; leave card logos untouched')
    parser.add_argument('--logos-only', action='store_true',
                        help='regenerate only card logos; leave aircraft atlases untouched')
    parser.add_argument('--code', choices=('fedex', 'sf'), action='append',
                        help='select an output (repeatable; default: both)')
    args = parser.parse_args()
    if args.atlases_only and args.logos_only:
        parser.error('--atlases-only and --logos-only are mutually exclusive')
    LOGOS.mkdir(parents=True, exist_ok=True)
    codes = args.code or ('fedex', 'sf')
    if args.logos_only:
        for code in codes:
            logo = LOGOS / ('fedex.png' if code == 'fedex' else 'sf-express.png')
            make_card_logo(code, logo)
            print(f'{logo}: {Image.open(logo).size} RGBA')
        return
    blank = Image.open(AIRCRAFT / 'BLANK.png').convert('RGB')
    boe = Image.open(AIRCRAFT / 'BOE.png').convert('RGB')
    if blank.size != SIZE or boe.size != SIZE:
        raise SystemExit('Expected project BLANK.png and BOE.png 4096x1024 atlases')
    for code in codes:
        generate(code, blank, boe, make_logos=not args.atlases_only)


if __name__ == '__main__':
    main()
