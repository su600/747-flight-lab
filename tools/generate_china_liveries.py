#!/usr/bin/env python3
"""Generate three *fictional 747-400 adaptations*, not historical airframes.

Uses the project's BLANK/BOE UV atlases for the 747 geometry and panel details;
all airline emblems and flags below are original vector approximations, drawn
here, not copied from third-party images. No registration numbers are implied.
Visual-only references (FG-Liveries, GPL-2.0):
https://github.com/naviat-dev/FG-Liveries/blob/eae9eaf1d079afd4a558ad115209d25cf9346205/787%20%28legacy%29/Liveries-9/CES.png
https://github.com/naviat-dev/FG-Liveries/blob/eae9eaf1d079afd4a558ad115209d25cf9346205/A350/CSN.png
https://github.com/naviat-dev/FG-Liveries/blob/eae9eaf1d079afd4a558ad115209d25cf9346205/787%20%28legacy%29/Liveries-9/CHH.png
No reference images are inputs to this script. Airline marks are trademarks.
Requires Python 3, Pillow, numpy, fontconfig, Noto Sans CJK SC and DejaVu Sans.
Run from any directory: python3 tools/generate_china_liveries.py
The PNG Comment metadata also identifies these as fictional adaptations.
"""
from pathlib import Path
import math
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, PngImagePlugin

ROOT = Path(__file__).resolve().parents[1]
AIRCRAFT = ROOT / 'assets' / 'aircraft'
SIZE = (4096, 1024)
NAVY_BG = (36, 67, 117)
WHITE = '#ffffff'
S = 3  # supersampling for vector emblems


def font(pattern, size):
    result = subprocess.check_output(
        ['fc-match', '-f', '%{file}\n%{index}', pattern], text=True).splitlines()
    return ImageFont.truetype(result[0], size, index=int(result[1] or 0))


def cubic(a, b, c, d, n=24):
    result = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        result.append((u**3*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t**3*d[0],
                       u**3*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t**3*d[1]))
    return result


def path(draw, start, segments, fill):
    """Filled cubic Bézier path in a 300 x 300 design space."""
    points = [start]
    current = start
    for a, b, end in segments:
        points.extend(cubic(current, a, b, end)[1:])
        current = end
    draw.polygon([(round(x*S), round(y*S)) for x, y in points], fill=fill)


def eastern():
    """The red, angular swallow and its separate blue tapered return stroke."""
    im = Image.new('RGBA', (300*S, 300*S))
    d = ImageDraw.Draw(im)
    path(d, (23, 45), [
        ((61, 45), (111, 45), (148, 45)),
        ((165, 45), (169, 50), (178, 62)),
        ((198, 90), (212, 112), (220, 121)),
        ((223, 125), (237, 124), (252, 124)),
        ((239, 162), (220, 199), (202, 217)),
        ((188, 232), (174, 237), (158, 237)),
        ((146, 237), (126, 237), (102, 237)),
        ((146, 220), (172, 201), (180, 177)),
        ((184, 155), (169, 132), (146, 111)),
        ((109, 77), (67, 59), (23, 45))], '#e60012')
    path(d, (10, 112), [
        ((52, 112), (122, 119), (157, 137)),
        ((181, 149), (187, 162), (178, 173)),
        ((167, 188), (129, 199), (70, 207)),
        ((107, 194), (136, 182), (136, 172)),
        ((136, 153), (84, 132), (20, 119)),
        ((15, 117), (12, 114), (10, 112))], '#192079')
    return im


def southern():
    """Stylised kapok: three stamens, curled petals and a cupped base."""
    red = '#ed1b2f'
    im = Image.new('RGBA', (300*S, 300*S))
    d = ImageDraw.Draw(im)
    # White-keylined stamens sit behind the main flower.
    for x, y in ((103, 53), (150, 39), (197, 53)):
        d.line((x*S, y*S, x*S, 113*S), fill=WHITE, width=19*S)
        d.line((x*S, y*S, x*S, 113*S), fill=red, width=10*S)
        d.ellipse(((x-21)*S, (y-21)*S, (x+21)*S, (y+21)*S), fill=WHITE)
        d.ellipse(((x-14)*S, (y-14)*S, (x+14)*S, (y+14)*S), fill=red)
    flower = Image.new('RGBA', im.size)
    p = ImageDraw.Draw(flower)
    path(p, (150, 287), [
        ((108, 287), (83, 265), (83, 225)),
        ((83, 205), (83, 178), (83, 154)),
        ((83, 136), (77, 123), (64, 120)),
        ((75, 130), (72, 145), (61, 151)),
        ((44, 160), (25, 148), (25, 132)),
        ((25, 102), (45, 90), (72, 91)),
        ((103, 92), (128, 109), (137, 133)),
        ((140, 116), (145, 108), (150, 103)),
        ((155, 108), (160, 116), (163, 133)),
        ((172, 109), (197, 92), (228, 91)),
        ((255, 90), (275, 102), (275, 132)),
        ((275, 148), (256, 160), (239, 151)),
        ((228, 145), (225, 130), (236, 120)),
        ((223, 123), (217, 136), (217, 154)),
        ((217, 178), (217, 205), (217, 225)),
        ((217, 265), (192, 287), (150, 287))], red)
    outline = flower.getchannel('A').filter(ImageFilter.MaxFilter(15*S))
    im.paste(WHITE, (0, 0), outline)
    im.alpha_composite(flower)
    d = ImageDraw.Draw(im)
    def line_curve(parts, width=6):
        pts = []
        for a, b, c, e in parts:
            pts.extend((round(x*S), round(y*S)) for x, y in cubic(a, b, c, e))
        d.line(pts, fill=WHITE, width=width*S, joint='curve')
    line_curve([((73, 92), (105, 92), (122, 113), (123, 146)),
                ((123, 146), (123, 173), (123, 199), (123, 238))])
    line_curve([((227, 92), (195, 92), (178, 113), (177, 146)),
                ((177, 146), (177, 173), (177, 199), (177, 238))])
    line_curve([((150, 103), (150, 130), (150, 169), (150, 213))])
    line_curve([((83, 224), (100, 227), (114, 233), (123, 245)),
                ((123, 245), (128, 232), (139, 220), (150, 213)),
                ((150, 213), (161, 220), (172, 232), (177, 245)),
                ((177, 245), (186, 233), (200, 227), (217, 224))])
    return im


def hainan_tail():
    """Draw Hainan's broad gold phoenix ribbons and lower spiral on the fin.

    This is in tail-local UV coordinates, not a circular generic bird badge.
    It intentionally extends across the leading edge and is clipped to the fin.
    """
    im = Image.new('RGBA', (560*S, 300*S))
    d = ImageDraw.Draw(im)
    gold = '#ffdb00'
    path(d, (367, 52), [
        ((450, 68), (476, 95), (450, 128)),
        ((425, 159), (365, 165), (267, 184)),
        ((207, 196), (156, 217), (105, 238)),
        ((167, 190), (222, 159), (289, 151)),
        ((371, 139), (425, 127), (431, 103)),
        ((437, 82), (405, 64), (367, 52))], gold)
    path(d, (365, 52), [
        ((422, 68), (445, 83), (425, 104)),
        ((405, 127), (348, 137), (283, 143)),
        ((253, 146), (230, 151), (209, 159)),
        ((233, 144), (258, 135), (287, 131)),
        ((355, 122), (401, 116), (414, 99)),
        ((428, 81), (400, 63), (365, 52))], gold)
    path(d, (365, 52), [
        ((404, 67), (422, 79), (405, 95)),
        ((390, 111), (355, 118), (312, 121)),
        ((282, 123), (255, 125), (238, 131)),
        ((257, 122), (283, 115), (313, 112)),
        ((356, 108), (385, 102), (395, 91)),
        ((408, 77), (389, 62), (365, 52))], gold)
    path(d, (105, 238), [
        ((180, 201), (272, 177), (333, 183)),
        ((370, 186), (384, 204), (370, 222)),
        ((357, 241), (326, 249), (299, 241)),
        ((274, 234), (270, 218), (286, 208)),
        ((292, 204), (299, 202), (307, 202)),
        ((289, 213), (294, 224), (307, 227)),
        ((321, 230), (338, 223), (340, 213)),
        ((343, 199), (320, 196), (291, 198)),
        ((230, 200), (164, 219), (105, 238))], gold)
    return im.resize((560, 300), Image.Resampling.LANCZOS)


def hainan_mark():
    """Small red phoenix/sun mark used alongside the Chinese wordmark."""
    half = Image.new('RGBA', (300*S, 300*S))
    d = ImageDraw.Draw(half)
    red = '#e60012'
    path(d, (112, 42), [
        ((65, 50), (31, 78), (34, 121)),
        ((36, 159), (67, 177), (104, 194)),
        ((128, 206), (143, 222), (150, 247)),
        ((147, 209), (134, 191), (109, 178)),
        ((78, 162), (51, 153), (49, 121)),
        ((47, 86), (71, 58), (112, 42))], red)
    path(d, (113, 48), [
        ((79, 59), (61, 83), (62, 111)),
        ((63, 144), (91, 158), (121, 171)),
        ((132, 176), (143, 183), (150, 191)),
        ((143, 180), (137, 167), (123, 160)),
        ((94, 146), (75, 135), (74, 109)),
        ((73, 83), (88, 61), (113, 48))], red)
    path(d, (145, 247), [
        ((126, 212), (105, 202), (79, 204)),
        ((54, 206), (42, 221), (45, 237)),
        ((48, 253), (62, 259), (73, 253)),
        ((82, 248), (80, 238), (74, 233)),
        ((69, 229), (63, 232), (64, 238)),
        ((54, 230), (62, 219), (76, 220)),
        ((101, 218), (129, 233), (145, 247))], red)
    # Mirror only the graphic, not the adjacent Chinese text.
    mirrored = half.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    half.alpha_composite(mirrored)
    d = ImageDraw.Draw(half)
    d.ellipse((130*S, 62*S, 170*S, 102*S), fill=red)
    return half


def star(draw, cx, cy, r, color, angle=-90):
    pts = []
    for i in range(10):
        a = math.radians(angle + 36*i)
        radius = r if i % 2 == 0 else r * 0.382
        pts.append((cx + math.cos(a)*radius, cy + math.sin(a)*radius))
    draw.polygon(pts, fill=color)


def flag(image, x, y):
    # Chinese flag, 3:2 proportions and official star positions.
    d = ImageDraw.Draw(image)
    d.rectangle((x, y, x+44, y+29), fill='#e50012')
    star(d, x+7.5, y+7.5, 4.5, '#ffde00')
    for sx, sy in [(15, 3), (18, 6), (18, 10), (15, 13)]:
        # One point of each small star points at the large star's centre.
        angle = math.degrees(math.atan2(7.5-sy, 7.5-sx))
        star(d, x+sx, y+sy, 1.5, '#ffde00', angle)


def title(image, text, box, pattern, color, size):
    """Fit unmirrored text within a side's clear space above its windows."""
    x, y, w, h = box
    while size > 8:
        f = font(pattern, size)
        bounds = f.getbbox(text)
        if bounds[2]-bounds[0] <= w and bounds[3]-bounds[1] <= h:
            break
        size -= 1
    ImageDraw.Draw(image).text((x, y-bounds[1]), text, font=f, fill=color)


def hull_mask(blank):
    # The BLANK atlas has a uniform blue outside both body islands. Keep all
    # grayscale windows, doors and antialiased edge pixels inside the mask.
    arr = np.asarray(blank.convert('RGB')).astype(np.int16)
    delta = np.max(np.abs(arr - np.array(NAVY_BG)), axis=2)
    m = np.zeros((SIZE[1], SIZE[0]), np.uint8)
    m[:565, :2358] = np.where(delta[:565, :2358] > 15, 255, 0).astype(np.uint8)
    return Image.fromarray(m)


def restore_details(image, blank):
    # Restore the original grayscale door outlines, glass and cargo doors on
    # top of paint. Blue atlas background is deliberately excluded.
    a = np.asarray(blank.convert('RGB')).astype(np.int16)
    dark = a.max(axis=2)
    gray = a.max(axis=2) - a.min(axis=2) < 12
    alpha = np.where(gray, np.clip((250-dark)*28, 0, 255), 0).astype(np.uint8)
    alpha[565:, :] = 0
    alpha[:, 2358:] = 0
    image.paste(blank, (0, 0), Image.fromarray(alpha))


def tail(image, color, code, emblem=None):
    # Both tail UV islands have the same physical front-to-back orientation.
    # Paint beyond the vstab/rudder UV boundaries for texture filtering.
    for dx in (0, 575):
        poly = [(0+dx, 956), (74+dx, 903), (392+dx, 644),
                (548+dx, 644), (423+dx, 956)]
        ImageDraw.Draw(image).polygon(poly, fill=color)
        if code == 'CHH':
            art = hainan_tail()
            clip = Image.new('L', image.size)
            ImageDraw.Draw(clip).polygon(poly, fill=255)
            layer = Image.new('RGBA', image.size)
            layer.paste(art, (dx, 648), art)
            alpha = np.minimum(np.asarray(layer.getchannel('A')), np.asarray(clip))
            image.paste(layer.convert('RGB'), (0, 0), Image.fromarray(alpha))
        else:
            icon = emblem().resize((195, 195), Image.Resampling.LANCZOS)
            image.paste(icon, (277+dx, 703), icon)


def winglets(image, boe, color):
    # BOE contains four mapped winglet faces where BLANK has a white block.
    # Preserve the surrounding UV padding and tint the actual white faces.
    box = (3068, 0, 3438, 685)
    source = boe.crop(box).convert('RGB')
    a = np.asarray(source).astype(np.int16)
    white = (a.min(axis=2) > 205) & (a.max(axis=2) - a.min(axis=2) < 25)
    face = Image.new('RGB', source.size, color)
    source.paste(face, (0, 0), Image.fromarray((white*255).astype(np.uint8)))
    image.paste(source, box[:2])


def paint_body(image, mask, variant):
    layer = Image.new('RGB', SIZE, WHITE)
    d = ImageDraw.Draw(layer)
    # Body islands run nose-left above and nose-right below. Mirror only the
    # paint geometry, never the text. Coordinates are based on BOE/CCA/BLANK.
    if variant == 'CEA':
        pass  # The modern swallow scheme uses a clean white fuselage.
    elif variant == 'CSN':
        for y in (0, 282):
            d.rectangle((0, y+165, 2357, y+171), fill='#0098ce')
            d.rectangle((0, y+172, 2357, y+175), fill='#d5ad42')
            d.rectangle((0, y+176, 2357, y+197), fill='#082b61')
            d.rectangle((0, y+198, 2357, y+200), fill='#d5ad42')
            d.rectangle((0, y+201, 2357, y+206), fill='#0098ce')
    else:
        # Two individually transformed Bézier ribbons: nose-left on the
        # upper island, nose-right on the lower. Windows are restored below.
        def ribbon(start, segments, color):
            points = [start]
            current = start
            for a, b, end in segments:
                points.extend(cubic(current, a, b, end)[1:])
                current = end
            d.polygon([(x, y-25) for x, y in points], fill=color)
            d.polygon([(2377-x, y+257) for x, y in points], fill=color)
        ribbon((380, 274), [
            ((670, 240), (820, 178), (1110, 173)),
            ((1480, 162), (1710, 211), (1920, 199)),
            ((2110, 191), (2270, 143), (2357, 127)),
            ((2357, 173), (2357, 224), (2357, 275)),
            ((2080, 278), (1840, 258), (1570, 224)),
            ((1160, 174), (890, 225), (690, 260)),
            ((550, 274), (445, 274), (380, 274))], '#ed1b2f')
        ribbon((380, 274), [
            ((690, 249), (870, 202), (1120, 198)),
            ((1470, 194), (1750, 252), (1960, 254)),
            ((2130, 253), (2270, 231), (2357, 220)),
            ((2357, 234), (2357, 242), (2357, 246)),
            ((2140, 269), (1900, 278), (1570, 236)),
            ((1190, 186), (920, 231), (690, 266)),
            ((550, 279), (445, 275), (380, 274))], '#ffdb00')
    image.paste(layer, (0, 0), mask)


def engines(image, blank, color):
    # Keep BLANK's black outlines and panel detail on the two nacelle islands.
    for x0, x1 in ((2407, 2700), (2735, 3018)):
        d = ImageDraw.Draw(image)
        d.rectangle((x0, 174, x1, 202), fill=color)
        # Restore dark engine-edge pixels, not white interior.
        src = blank.crop((x0, 174, x1+1, 203)).convert('RGB')
        a = np.asarray(src)
        m = np.where(a.max(axis=2) < 120, 255, 0).astype(np.uint8)
        image.paste(src, (x0, 174), Image.fromarray(m))


def generate(code, spec, blank, boe, mask):
    image = blank.copy().convert('RGB')
    paint_body(image, mask, code)
    restore_details(image, blank)
    tail(image, spec['tail'], code, spec.get('emblem'))
    winglets(image, boe, spec['tail'])
    engines(image, blank, spec['engine'])
    # Both titles are independently typeset, so neither aircraft side is
    # mirrored. Boxes sit between the upper- and main-deck window rows.
    enfont = 'DejaVu Sans:style=Bold'
    cnfont = 'Noto Sans CJK SC:style=Bold'
    cn_x = 590 if code == 'CHH' else 550
    title(image, spec['cn'], (cn_x, 83, 310, 43), cnfont, spec['cn_color'], 40)
    title(image, spec['en'], (900, 89, 420, 40), enfont, spec['text'], 37)
    title(image, spec['en'], (1120, 371, 420, 32), enfont, spec['text'], 37)
    title(image, spec['cn'], (1550, 366, 260, 34), cnfont, spec['cn_color'], 38)
    if code == 'CHH':
        mark = hainan_mark().resize((36, 36), Image.Resampling.LANCZOS)
        image.paste(mark, (545, 85), mark)
        image.paste(mark, (1508, 364), mark)
    flag(image, 415, 92)
    flag(image, 2020, 368)
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text('Comment', f"Fictional 747-400 livery adaptation: {spec['en']}; no real registration. Original vector approximations; base UV atlas from this project.")
    image.save(AIRCRAFT / f'{code}.png', pnginfo=metadata, optimize=True)
    print(f"{AIRCRAFT / (code + '.png')}  {image.width}x{image.height} RGB")


def main():
    blank = Image.open(AIRCRAFT / 'BLANK.png').convert('RGB')
    boe = Image.open(AIRCRAFT / 'BOE.png').convert('RGB')
    if blank.size != SIZE or boe.size != SIZE:
        raise ValueError('Expected 4096x1024 BLANK and BOE UV atlases')
    specs = {
        'CEA': dict(en='CHINA EASTERN', cn='中国东方航空', text='#192079', cn_color='#e60012',
                    tail='#ffffff', engine='#ffffff', emblem=eastern),
        'CSN': dict(en='CHINA SOUTHERN', cn='中国南方航空', text='#10121b', cn_color='#10121b',
                    tail='#0093c9', engine='#0093c9', emblem=southern),
        'CHH': dict(en='Hainan Airlines', cn='海南航空', text='#e60012', cn_color='#e60012',
                    tail='#ed1b2f', engine='#ffffff'),
    }
    mask = hull_mask(blank)
    for code, spec in specs.items():
        generate(code, spec, blank, boe, mask)


if __name__ == '__main__':
    main()
