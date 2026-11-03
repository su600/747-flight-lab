#!/usr/bin/env python3
"""Draw accurate-as-practical A330-300 liveries onto the FlightGear 323 UV atlas.

Run:  python generate_liveries.py [ID ...]      (default: every livery listed in BUILD)
Needs Pillow + NumPy, Windows system fonts (see paint_core.FONTS) and
derived/island-masks.npz (python build_masks.py).

All artwork is original vector drawing made from photographs of the real
aircraft (reference only, nothing copied). Emblems that are already part of the
project (assets/livery-logos/*.png) are re-used as masks. The five upstream
liveries (CCA, CES, CSN, DLH, KLM) are shipped unmodified from FlightGear.

Coordinates: s = metres aft of the nose tip, y = metres above the AC origin
(the passenger window line is about y=1.2, the crown y=3.16, the keel y=-2.7).
Both sides are drawn with the same function; titles therefore read left-to-right
on each side as on the real aircraft.
"""
import math
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageChops, PngImagePlugin
from paint_core import Side, Atlas, rgb, font, HERE, NOSE_X, PPM

LOGOS = HERE.parent / 'livery-logos'
OUT = HERE / 'derived' / 'liveries'
BLANK = HERE / 'Models' / '323_blank.png'
WINDOWLESS = HERE / 'derived' / '323_windowless.png'

WHITE = (248, 248, 246)
CROWN = 3.16
KEEL = [(0, -1.2), (4.4, -2.24), (9, -2.62), (18, -2.68), (23, -3.03), (32, -3.03), (37, -2.78), (41, -2.62), (46, -2.30), (50.6, -1.48), (55.2, -0.15), (60, 1.49)]


def interp(table, s):
    if s <= table[0][0]: return table[0][1]
    for (a, ya), (b, yb) in zip(table, table[1:]):
        if s <= b: return ya + (yb - ya) * (s - a) / (b - a)
    return table[-1][1]


def keel(s): return interp(KEEL, s) - 0.05
def yw(s): return 1.38 - 0.00883 * (48.73 - s)          # window-line height
def fx(x): return x - NOSE_X                             # AC x -> s
def fin_le(y): return fx(27.55 + 0.969 * (y - 4.0))      # fin leading edge (s) at height y
def fin_te(y): return fx(34.57 + 0.40 * (y - 4.0))
SS = np.linspace(-3, 70, 74)


def P(x, y): return (fx(x), y)


def curve(points, steps=16):
    """Catmull-Rom spline through points -> dense polyline."""
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for k in range(steps):
            t = k / steps; t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(points[-1])
    return out


def ring(upper, lower): return list(upper) + list(reversed(lower))
def fn_curve(f, s0=-3, s1=70, n=60): return [(s0 + (s1 - s0) * i / n, f(s0 + (s1 - s0) * i / n)) for i in range(n + 1)]


def below(c, f, colour, s0=-3.0, s1=70.0):
    """Paint everything below the curve y=f(s) down past the keel."""
    c.poly(fn_curve(f, s0, s1) + [(s1, -6), (s0, -6)], colour)


def between(c, top, bottom, colour, s0=-3.0, s1=70.0):
    c.poly(ring(fn_curve(top, s0, s1), fn_curve(bottom, s0, s1)), colour)


def fin_poly(c, colour):
    """The vertical fin and rudder silhouette (above the crown), slightly oversize."""
    ys = [3.1, 5, 7, 9, 11.4]
    lead = [(fin_le(y) - 0.4, y) for y in ys]
    trail = [(fin_te(y) + 0.6, y) for y in ys]
    c.poly(ring(lead, trail), colour)


def rotated_text(c, s, y, string, face, fill, cap_m, length_m, angle, port_flip=True):
    """Text rotated by `angle` degrees (counter-clockwise, in the drawn view), centred at (s, y)."""
    layer = Image.new('L', (int(length_m * PPM * 2 + 40), int(cap_m * PPM * 3 + 40)), 0)
    ImageDraw.Draw(layer).text((layer.width / 2, layer.height / 2), string, font=font(face, cap_m * PPM / 0.72), fill=255, anchor='mm')
    layer = layer.crop(layer.getbbox())
    layer = layer.resize((int(length_m * PPM), int(cap_m * PPM)), Image.LANCZOS)
    layer = layer.rotate(angle, expand=True, resample=Image.BICUBIC)
    c._paste_mask(layer, c.px(s), c.py(y), fill)


def flag(c, s_left, y_top, width, height, wave=0.0, canton_left=True, lean=0.0):
    """US flag; canton at the left or right end. wave bends the stripes; lean shears the lower edge aft."""
    red, white, blue = (178, 34, 52), (250, 250, 248), (60, 59, 110)
    def pt(u, v):
        uu = u if canton_left else 1 - u
        return (s_left + uu * width * (1 if not c.port else 1) + lean * v, y_top - v * height + wave * math.sin(u * math.pi * 2 - .5) * math.sin(math.pi * u))
    for i in range(13):
        v0, v1 = i / 13, (i + 1) / 13
        top = [pt(k / 24, v0) for k in range(25)]; bot = [pt(k / 24, v1) for k in range(24, -1, -1)]
        c.poly(top + bot, red if i % 2 == 0 else white)
    cant = [pt(0, 0), pt(.4, 0), pt(.4, 7 / 13), pt(0, 7 / 13)]
    c.poly(cant, blue)
    for row in range(9):
        n = 6 if row % 2 == 0 else 5
        for k in range(n):
            u = (.035 + k * .066) if n == 6 else (.068 + k * .066)
            x, y = pt(u, .04 + row * .056)
            c.ellipse(x, y, .045 * width / 4, .045 * width / 4, white)


# ===================================================================================
# BOE: Airbus house colours, as worn by the first A330-300 (F-WWKA, 1992).  REAL.
# ===================================================================================
def draw_BOE(c: Side):
    navy = (20, 28, 92)
    tip_y, slope = 11.25, 0.755
    aft_edge = lambda y: fx(37.55) - (tip_y - y) * slope
    ys = np.linspace(tip_y, -3.4, 30)
    fwd = [((min(aft_edge(y) - 4.9, fin_le(y) - 0.35) if y > 3.16 else aft_edge(y) - 4.9), y) for y in ys]
    aft = [(aft_edge(y), y) for y in ys]
    width = 1.05
    for col, a, b in [((96, 24, 70), 0.0, 0.18), ((176, 24, 48), 0.18, 0.36), ((222, 52, 36), 0.36, 0.56), ((244, 124, 28), 0.56, 0.78), ((250, 200, 56), 0.78, 1.0)]:
        c.poly(ring([(aft_edge(y) + a * width, y) for y in ys], [(aft_edge(y) + b * width, y) for y in ys]), col)
    c.poly(ring(fwd, aft), navy)
    ang = math.degrees(math.atan(slope))
    rotated_text(c, (aft_edge(8.2) + aft_edge(8.2) - 4.9) / 2 + 0.55, 8.2, 'A330', 'black', (250, 250, 250), 1.25, 5.8, (90 - ang) if c.port else -(90 - ang))
    c.text(10.0, 18.5, 2.18, 'A330', 'black', (22, 30, 100), 1.15, stretch=True)


# ===================================================================================
# UAE: Emirates A330 (A330-200/-300 fleet).  REAL (A330-300 was operated until the 2010s).
# ===================================================================================
def draw_UAE(c: Side):
    red, green, black = (206, 17, 38), (0, 122, 61), (24, 24, 26)
    gold = (170, 124, 58)
    # flag stripes rising towards the trailing edge, top edge through the leading-edge tip corner
    top = lambda x: 11.25 + 0.5 * (x - 34.75)
    for lo, hi, col in [(3.0, 4.5, black), (1.5, 3.0, WHITE), (0.0, 1.5, green)]:
        # (lo,hi) measured downward from the top edge: stripe between top-hi and top-lo
        xs = [26.0, 38.5]
        c.poly([P(xs[0], top(xs[0]) - hi), P(xs[1], top(xs[1]) - hi), P(xs[1], top(xs[1]) - lo), P(xs[0], top(xs[0]) - lo)], col, ymin=3.12)
    # red hoist band hugging the leading edge, continuing as a swoosh onto the rear fuselage
    ys = [3.1, 5.0, 7.0, 9.0, 11.4]
    left = [(fin_le(y) + 0.25, y) for y in ys]
    right = [(fin_le(y) + 0.25 + (2.1 - 0.35 * (y - 3.1) / 8.3), y) for y in ys]
    c.poly(ring(left, right), red)
    sw_fwd = curve([P(26.55, 3.2), P(24.2, 1.9), P(22.0, 0.3), P(20.0, -0.9)], 12)
    sw_aft = curve([P(28.9, 3.2), P(26.3, 1.9), P(23.4, 0.45), P(20.0, -0.9)], 12)
    c.poly(ring(sw_aft, sw_fwd), red)
    # titles
    c.text(7.2, 22.6, 2.1, 'Emirates', 'georgiab', gold, 1.3, stretch=True)
    c.text(24.5, 32.0, 2.0, 'ﺕﺍﺭﺎﻣﻹﺍ', 'uni', gold, 0.95, stretch=True)
    c.text(10.5, 21.5, 0.3, 'www.emirates.com', 'sansb', (96, 96, 96), 0.27, stretch=True)


# ===================================================================================
# CHH: Hainan Airlines A330-200/-300.  REAL.
# ===================================================================================
def draw_CHH(c: Side):
    red, gold, belly = (209, 27, 39), (250, 196, 20), (214, 216, 218)
    U = [(13, -2.6), (16, -2.1), (22, -1.3), (28, -0.85), (34, -0.25), (38.6, 1.24), (43.4, 2.14), (48.2, 3.3), (52, 3.7), (70, 3.7)]
    upper = lambda s: interp(U, s)
    thick = lambda s: 1.0 + 0.05 * max(0.0, s - 13) if s < 44 else 6.0
    # grey belly, then the red ribbon, then the thin yellow line along its upper edge
    below(c, lambda s: min(keel(s) + 1.5, -1.45), belly, s0=1.0, s1=50.0)
    between(c, upper, lambda s: upper(s) - thick(s), red, s0=13, s1=70)
    between(c, lambda s: upper(s) + 0.17, upper, gold, s0=13, s1=52)
    # fin: solid red, plus the gold swirl (project's Hainan emblem mask turned into the tail swirl)
    fin_poly(c, red)
    c.logo(LOGOS / 'hainan.png', fx(31.9), 6.9, 3.5, color=gold, rot=-128 if not c.port else 128)
    # titles: English then Chinese when read left to right on each side (starboard: English aft)
    pv = (8.5 + 31.0) / 2
    c.text(*c.mir(19.0, 31.0, pv), 2.15, 'Hainan Airlines', 'sansbi', (150, 28, 38), 0.78, stretch=True)
    c.text(*c.mir(8.5, 17.0, pv), 2.15, '海南航空', 'cjk', red, 0.8, stretch=True)
    c.rect(3.2, 5.6, 1.7, 2.3, red)
    c.text(3.35, 5.45, 2.0, 'HNA', 'sansb', (255, 255, 255), 0.4, stretch=True)


# ===================================================================================
# BAW: British Airways livery adapted to the A330.  NONE (BA never operated the A330).
# ===================================================================================
def draw_BAW(c: Side):
    navy, red = (21, 36, 82), (206, 32, 48)
    boundary = lambda s: yw(s) - 0.55 + 0.012 * max(0.0, s - 10)
    below(c, boundary, navy, s0=1.0, s1=64.0)
    between(c, lambda s: boundary(s) + 0.1, boundary, red, s0=1.0, s1=64.0)
    fin_poly(c, navy)
    # Union-flag style swoops on the fin
    sw = curve([P(25.5, 3.3), P(29.0, 5.0), P(33.0, 8.5), P(36.5, 11.4)], 12)
    sw2 = curve([P(27.8, 3.3), P(31.3, 5.0), P(35.0, 8.5), P(38.3, 11.4)], 12)
    c.poly(ring(sw2, sw), WHITE, ymin=3.12)
    sw3 = curve([P(24.2, 3.3), P(27.6, 5.0), P(31.6, 8.5), P(35.1, 11.4)], 12)
    c.poly(ring(sw, sw3), red, ymin=3.12)
    c.text(8.5, 31.0, 2.15, 'British Airways', 'sansbi', (21, 36, 82), 0.8, stretch=True)
    c.logo(LOGOS / 'british-airways.png', 40.0, 2.15, 0.9)


# ===================================================================================
# DLH100: Lufthansa 100-year scheme (real aircraft was a 747-8).  NONE on the A330.
# ===================================================================================
def draw_DLH100(c: Side):
    navy, silver = (12, 24, 53), (150, 168, 182)
    c.rect(-5, 75, -6, 14, navy)
    white_lo = curve([(11, 2.6), (20, 1.2), (30, 0.25), (40, 0.5), (48, 1.7), (53, 3.1)], 10)
    c.poly(ring([(s, 3.5) for s, _ in white_lo], white_lo), WHITE)
    c.ellipse(fx(31.2), 7.2, 2.0, 2.0, (236, 240, 242))
    c.ellipse(fx(31.2), 7.2, 1.85, 1.85, navy)
    c.logo(LOGOS / 'lufthansa.png', fx(31.2), 7.2, 3.9, color=(236, 240, 242))
    c.text(10.0, 24.0, -0.6, '1926 / 2026', 'sansb', silver, 0.7, stretch=True)
    c.text(5.0, 10.0, 0.4, 'Lufthansa', 'sansb', (236, 240, 242), 0.5, stretch=True)


# ===================================================================================
# AF1_CLASSIC / AF1_2026: VC-25 style presidential schemes.  NONE (no presidential A330).
# ===================================================================================
def draw_AF1_CLASSIC(c: Side):
    navy = (24, 56, 94)
    below(c, lambda s: yw(s) - 0.75, (91, 164, 203), s0=1.0, s1=64.0)
    below(c, lambda s: yw(s) - 1.9, (156, 206, 228), s0=1.0, s1=64.0)
    below(c, lambda s: min(keel(s) + 1.1, -1.7), (190, 218, 229), s0=1.0, s1=64.0)
    between(c, lambda s: yw(s) - 0.6, lambda s: yw(s) - 0.7, navy, s0=1.0, s1=64.0)
    c.text(10.0, 33.0, 2.3, 'UNITED STATES OF AMERICA', 'serif', navy, 0.55, stretch=True)
    c.ellipse(7.0, 1.95, 0.55, 0.55, navy)
    c.ellipse(7.0, 1.95, 0.42, 0.42, (236, 224, 170))
    flag(c, fin_le(10.2) - 2.2 if c.port else fin_le(10.2) + 0.3, 10.0, 2.2, 1.2, canton_left=not c.port)


def draw_AF1_2026(c: Side):
    navy, red, gold = (12, 34, 65), (178, 34, 52), (199, 157, 73)
    below(c, lambda s: yw(s) - 0.75, navy, s0=1.0, s1=64.0)
    between(c, lambda s: yw(s) - 0.5, lambda s: yw(s) - 0.62, red, s0=1.0, s1=64.0)
    between(c, lambda s: yw(s) - 0.62, lambda s: yw(s) - 0.7, gold, s0=1.0, s1=64.0)
    c.poly([P(24.0, 3.3), P(29.0, 3.3), P(32.5, 5.3), P(27.0, 5.3)], navy, ymin=3.12)
    c.text(10.0, 33.0, 2.3, 'UNITED STATES OF AMERICA', 'serif', navy, 0.55, stretch=True)
    c.ellipse(7.0, 1.95, 0.55, 0.55, navy)
    c.ellipse(7.0, 1.95, 0.42, 0.42, gold)
    flag(c, fin_le(8.6) - 3.4 if c.port else fin_le(8.6) + 0.1, 11.0, 3.3, 3.8, wave=0.35, canton_left=not c.port)


# ===================================================================================
# fedex / sf: freighter-look adaptations on the windowless atlas.  NONE (no FedEx / SF A330).
# ===================================================================================
def draw_fedex(c: Side):
    purple, orange = (77, 20, 140), (255, 102, 0)
    fin_poly(c, purple)
    c.text_multi(fin_le(7.4) + 0.9, fin_le(7.4) + 4.7, 7.0, [('Fed', (255, 255, 255)), ('Ex', orange)], 'narrowb', 1.3)
    c.text_multi(15.5, 29.0, 1.55, [('Fed', purple), ('Ex', orange)], 'narrowb', 1.65)
    c.text(19.0, 25.5, 0.45, 'Express', 'sansb', purple, 0.42, stretch=True)


def draw_sf(c: Side):
    black, grey, red = (40, 42, 45), (115, 119, 122), (200, 16, 46)
    fin_poly(c, black)
    for top, bot, col in [(-1.55, -1.7, black), (-1.85, -1.97, grey), (-2.1, -2.2, black)]:
        between(c, lambda s, t=top: t, lambda s, b=bot: b, col, s0=1.5, s1=62.0)
    c.poly([(30.0, -1.45), (62.0, 2.2), (62.0, 1.4), (31.0, -1.7)], red)
    c.ellipse(fx(31.0), 6.6, 1.7, 1.7, (250, 250, 250))
    c.ellipse(fx(31.0), 6.6, 1.5, 1.5, black)
    c.text(fx(31.0) - 0.9, fx(31.0) + 0.9, 6.6, 'SF', 'sansb', (250, 250, 250), 1.1, stretch=True)


def sf_marks():
    """Unlit dark marks overlay (SF ring + AIRLINES / 顺丰航空), same UV space as the atlas."""
    stbd, port = Side(False, (0, 0, 0)), Side(True, (0, 0, 0))
    for c in (stbd, port):
        pv = 24.0
        a, b = c.mir(14.5, 17.4, pv)
        cx = (a + b) / 2
        c.ellipse(cx, 1.3, 1.35, 1.35, (255, 255, 255))
        c.ellipse(cx, 1.3, 1.2, 1.2, (0, 0, 0))
        c.text(cx - 0.8, cx + 0.8, 1.3, 'SF', 'sansb', (255, 255, 255), 0.95, stretch=True)
        s0, s1 = c.mir(19.0, 29.5, pv)
        c.text(s0, s1, 1.85, 'AIRLINES', 'sansb', (255, 255, 255), 0.62, stretch=True)
        c.text(s0, s1, 0.85, '顺丰航空', 'cjk', (255, 255, 255), 0.62, stretch=True)
    atlas = Atlas(WINDOWLESS).apply_sides(stbd, port)
    arr = np.array(atlas.out).astype(np.float32)
    base = np.maximum(np.array(atlas.base).astype(np.float32), 1.0)
    alpha = (np.clip((arr / base).mean(axis=2), 0, 1) * 255).astype(np.uint8)
    a = np.zeros((1024, 2048, 4), np.uint8)
    a[..., 0], a[..., 1], a[..., 2] = 10, 14, 18
    a[..., 3] = alpha
    d = OUT / 'sf-v2'
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(a, 'RGBA').save(d / 'sf-marks.png', optimize=True)
    print('wrote', d / 'sf-marks.png')


BUILD = {
    'BOE': (draw_BOE, BLANK, None),
    'UAE': (draw_UAE, BLANK, None),
    'CHH': (draw_CHH, BLANK, '#d11b27'),
    'BAW': (draw_BAW, BLANK, '#152452'),
    'DLH100': (draw_DLH100, BLANK, '#0c1835'),
    'AF1_CLASSIC': (draw_AF1_CLASSIC, BLANK, None),
    'AF1_2026': (draw_AF1_2026, BLANK, '#0c2241'),
    'fedex': (draw_fedex, WINDOWLESS, '#4d148c'),
    'sf': (draw_sf, WINDOWLESS, '#282a2d'),
}


def build(code):
    drawer, base, wing = BUILD[code]
    stbd, port = Side(False, WHITE), Side(True, WHITE)
    drawer(stbd)
    drawer(port)
    atlas = Atlas(base).apply_sides(stbd, port)
    atlas.winglets(wing)
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / (code + '.png')
    info = PngImagePlugin.PngInfo()
    info.add_text('Description', f'Unofficial A330-300 {code} livery drawn from side-view artwork onto the GPL FlightGear UV atlas. See assets/accurate-a330/NOTICE.')
    if code == 'sf':
        dest = OUT / 'sf-v2' / 'sf.png'
        dest.parent.mkdir(parents=True, exist_ok=True)
        sf_marks()
    elif code == 'fedex':
        dest = OUT / 'fedex-v2.png'
    atlas.finish().save(dest, pnginfo=info, optimize=True)
    print('wrote', dest, dest.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    for code in (sys.argv[1:] or list(BUILD)):
        build(code)
