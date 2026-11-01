#!/usr/bin/env python3
"""Draw three fictional 747-400 adaptations onto the project's BLANK UV atlas.

Usage: python3 tools/generate_world_liveries.py
Requires Pillow with libraqm and the freely licensed DejaVu fonts (on Debian:
python3-pil, fonts-dejavu-core; use a Pillow build with libraqm for Arabic).
No downloaded logos or photographs are used. The lettering is typeset with
DejaVu; the flags, ornaments and deliberately schematic seal are original
vector drawing. No aircraft registration or claim of a real airframe is made.

UV coordinates are in BLANK's 4096 x 1024 pixels. The upper fuselage points
left, the lower one right; lettering is independently typeset, never mirrored.
Both vertical stabilizer islands point the same way, as in CCA.png. BLANK's
window and door linework is multiplied back over the paint. The engine cowling
islands are painted too; other engine parts use the separate engine texture.
"""
from pathlib import Path
import math

from PIL import Image, ImageChops, ImageDraw, ImageFont, features

ROOT = Path(__file__).resolve().parents[1]
AIRCRAFT = ROOT / "assets" / "aircraft"
FONTDIR = Path("/usr/share/fonts/truetype/dejavu")
# Some distributions install these same fonts here instead.
if not FONTDIR.exists():
    FONTDIR = Path("/usr/share/fonts/dejavu")
SERIF = FONTDIR / "DejaVuSerif.ttf"
SERIF_BOLD = FONTDIR / "DejaVuSerif-Bold.ttf"
SANS = FONTDIR / "DejaVuSans.ttf"
SANS_BOLD = FONTDIR / "DejaVuSans-Bold.ttf"
S = 2  # Supersampling for small lettering, stars and curves.
W, H = 4096, 1024
BLUE_BG = (36, 67, 117)
WHITE = (250, 250, 248)
NAVY = (12, 34, 65)
RED = (177, 31, 44)
GOLD = (199, 157, 73)


def xy(points):
    return [(round(x * S), round(y * S)) for x, y in points]


def rect(d, box, fill, **kwargs):
    d.rectangle(tuple(round(v * S) for v in box), fill=fill, **kwargs)


def poly(d, points, fill):
    d.polygon(xy(points), fill=fill)


def line(d, points, fill, width=1, joint="curve"):
    d.line(xy(points), fill=fill, width=round(width * S), joint=joint)


def ellipse(d, box, fill, outline=None, width=1):
    d.ellipse(tuple(round(v * S) for v in box), fill=fill, outline=outline,
              width=round(width * S))


def star(d, x, y, radius, fill, inner=0.43, n=5):
    pts = []
    for i in range(2 * n):
        a = -math.pi / 2 + i * math.pi / n
        r = radius if i % 2 == 0 else radius * inner
        pts.append((x + math.cos(a) * r, y + math.sin(a) * r))
    poly(d, pts, fill)


def text_fit(canvas, text, box, font_path, color, size=70, direction=None,
             tracking=0):
    """Draw upright text into a target box, proportionally reducing if needed."""
    font = ImageFont.truetype(str(font_path), size * S,
                              layout_engine=ImageFont.Layout.RAQM)
    opts = {"direction": direction} if direction else {}
    probe = Image.new("RGBA", (1, 1))
    draw = ImageDraw.Draw(probe)
    if tracking:
        # Tracking is only used for the unshaped Latin title.
        widths = [draw.textlength(ch, font=font) for ch in text]
        width = round(sum(widths) + tracking * S * (len(text) - 1))
        bounds = [draw.textbbox((0, 0), ch, font=font) for ch in text if ch != " "]
        top = min(b[1] for b in bounds)
        bottom = max(b[3] for b in bounds)
        layer = Image.new("RGBA", (max(width + 8 * S, 1), bottom - top + 8 * S))
        ld = ImageDraw.Draw(layer)
        x = 4 * S
        for ch, advance in zip(text, widths):
            ld.text((round(x), 4 * S - top), ch, font=font, fill=color)
            x += advance + tracking * S
    else:
        b = draw.textbbox((0, 0), text, font=font, **opts)
        layer = Image.new("RGBA", (max(1, b[2] - b[0] + 8 * S),
                                   max(1, b[3] - b[1] + 8 * S)))
        ImageDraw.Draw(layer).text((4 * S - b[0], 4 * S - b[1]), text,
                                   font=font, fill=color, **opts)
    target_w = round((box[2] - box[0]) * S)
    target_h = round((box[3] - box[1]) * S)
    factor = min(target_w / layer.width, target_h / layer.height, 1)
    if factor < 1:
        layer = layer.resize((max(1, round(layer.width * factor)),
                              max(1, round(layer.height * factor))), Image.Resampling.LANCZOS)
    x = round((box[0] + box[2]) * S / 2 - layer.width / 2)
    y = round((box[1] + box[3]) * S / 2 - layer.height / 2)
    canvas.paste(layer, (x, y), layer)


def seal(d, cx, cy, r):
    """Original, simplified presidential-seal-like medallion; not an exact seal."""
    ellipse(d, (cx-r, cy-r, cx+r, cy+r), NAVY, GOLD, 1.4)
    ellipse(d, (cx-r*.83, cy-r*.83, cx+r*.83, cy+r*.83), NAVY, (240, 223, 165), .7)
    for i in range(24):
        a = 2 * math.pi * i / 24
        star(d, cx + r*.91*math.cos(a), cy + r*.91*math.sin(a), r*.035, (248, 239, 209))
    # Symmetric eagle silhouette, shield, olive branch and arrows.
    cream = (241, 231, 199)
    poly(d, [(cx,cy-r*.08),(cx-r*.14,cy-r*.27),(cx-r*.2,cy-r*.2),
             (cx-r*.59,cy-r*.39),(cx-r*.51,cy-r*.16),(cx-r*.3,cy+r*.01),
             (cx-r*.43,cy+r*.07),(cx-r*.22,cy+r*.14),(cx-r*.1,cy+r*.31),
             (cx,cy+r*.39),(cx+r*.1,cy+r*.31),(cx+r*.22,cy+r*.14),
             (cx+r*.43,cy+r*.07),(cx+r*.3,cy+r*.01),(cx+r*.51,cy-r*.16),
             (cx+r*.59,cy-r*.39),(cx+r*.2,cy-r*.2),(cx+r*.14,cy-r*.27)], cream)
    ellipse(d, (cx-r*.1, cy-r*.38, cx+r*.11, cy-r*.16), cream)
    poly(d, [(cx+r*.06,cy-r*.30),(cx+r*.18,cy-r*.27),(cx+r*.07,cy-r*.23)], GOLD)
    poly(d, [(cx-r*.16,cy-r*.05),(cx+r*.16,cy-r*.05),(cx+r*.13,cy+r*.21),
             (cx,cy+r*.32),(cx-r*.13,cy+r*.21)], (246,245,236))
    rect(d, (cx-r*.16,cy-r*.05,cx+r*.16,cy+r*.04), (42,71,109))
    for k in (-.08, 0, .08):
        line(d, [(cx+r*k,cy+r*.05),(cx+r*k,cy+r*.19)], RED, .9)
    line(d, [(cx-r*.42,cy+r*.26),(cx-r*.19,cy+r*.14)], GOLD, 1)
    line(d, [(cx+r*.20,cy+r*.14),(cx+r*.42,cy+r*.27)], GOLD, 1)
    for dx in (-.20, -.10, 0, .10, .20):
        star(d, cx+r*dx, cy-r*.51, r*.032, cream)


def flag(d, left, top, width, height, wave=0, slant=0):
    """Hand-drawn US flag with hoist/canton at the leading (left) end.

    Slant moves the lower edge left, following the sweep of the vertical fin.
    A sinusoidal displacement gives the 2026 flag a flying, not printed-box look.
    """
    def p(u, v):
        return (left + u*width - slant*v,
                top + v*height + wave*math.sin(u*math.pi*2 - .45)*math.sin(math.pi*u))
    def band(u0, u1, v0, v1, color):
        n = 48
        points = [p(u0 + (u1-u0)*i/n, v0) for i in range(n+1)]
        points += [p(u0 + (u1-u0)*i/n, v1) for i in range(n, -1, -1)]
        poly(d, points, color)
    for i in range(13):
        band(0, 1, i/13, (i+1)/13, (183, 37, 45) if i % 2 == 0 else (248,247,239))
    band(0, .4, 0, 7/13, (30, 55, 96))
    for row in range(9):
        count = 6 if row % 2 == 0 else 5
        for col in range(count):
            u = .034 + col*.066 if count == 6 else .067 + col*.066
            x, y = p(u, .037 + row*.058)
            star(d, x, y, min(width*.010, height*.020), (255,255,249))


def uae_tail(d, ox):
    # The two fin islands use identical handedness. The red trailing edge and
    # flowing tricolour are masked to the original fin silhouette later.
    y = 650
    rect(d, (ox, y, ox+550, 949), WHITE)
    poly(d, [(ox+0,y+280),(ox+70,y+299),(ox+422,y+299),
             (ox+545,y+0),(ox+478,y+0),(ox+365,y+155),
             (ox+175,y+250)], (210,24,39))
    poly(d, [(ox+10,y+299),(ox+118,y+299),(ox+425,y+27),
             (ox+397,y+21),(ox+293,y+91)], (0,119,78))
    poly(d, [(ox+43,y+299),(ox+174,y+299),(ox+456,y+34),
             (ox+426,y+27),(ox+118,y+299)], WHITE)
    poly(d, [(ox+174,y+299),(ox+248,y+299),(ox+478,y+39),
             (ox+456,y+34)], (20,27,32))
    # Fine, restrained separations give the flag definition at the UV edges.
    line(d, [(ox+116,y+297),(ox+426,y+27)], (229,235,229), 1)


def paint_body(im, kind):
    d = ImageDraw.Draw(im)
    for side in range(2):
        dy = 280 * side
        # All body bands go beyond the island so they remain seamless at edges.
        rect(d, (0,dy,2358,dy+280), WHITE)
        if kind == "classic":
            # White crown, a dark cheatline, blue window belt and pale lower body.
            rect(d, (0,dy+130,2358,dy+136), (24,56,94))
            rect(d, (0,dy+137,2358,dy+140), (241,241,231))
            rect(d, (0,dy+141,2358,dy+185), (91,164,203))
            rect(d, (0,dy+186,2358,dy+228), (156,206,228))
            rect(d, (0,dy+229,2358,dy+280), (190,218,229))
            line(d, [(0,dy+185),(2358,dy+185)], (113,180,212), 1)
        elif kind == "2026":
            # Keep the original dark cabin windows above the dark lower paint.
            rect(d, (0,dy+162,2358,dy+172), RED)
            rect(d, (0,dy+173,2358,dy+177), GOLD)
            rect(d, (0,dy+178,2358,dy+280), NAVY)
            line(d, [(0,dy+179),(2358,dy+179)], (38,62,90), 1)
        if kind == "uae":
            # Cabin titles stay clear of both the door and the upper deck windows.
            # Do not mirror the artwork: each side is readable from the outside.
            if side == 0:
                eng, arabic = (555,92,1120,141), (727,39,1120,93)
            else:
                eng, arabic = (1238,dy+92,1803,dy+141), (1238,dy+39,1631,dy+93)
            text_fit(im, "Emirates", eng, SERIF_BOLD, (174,135,58,255), 72)
            text_fit(im, "الإمارات", arabic, SANS_BOLD, (174,135,58,255), 74, "rtl")
        else:
            title = (560,79,1480,125) if side == 0 else (878,dy+79,1798,dy+125)
            text_fit(im, "UNITED STATES OF AMERICA", title, SERIF, NAVY+(255,), 52, tracking=1.5)
            # Same fore-aft position on both sides, kept away from the cabin doors.
            seal(d, 230 if side == 0 else 2128, dy+207, 27)
    # Engine UV patches belong to the fuselage atlas, not the separate engine map.
    for x0, x1 in ((2408,2680),(2735,3018)):
        if kind == "classic":
            rect(d, (x0,38,x1,106), WHITE)
            rect(d, (x0,107,x1,151), (91,164,203))
            rect(d, (x0,152,x1,221), (156,206,228))
        elif kind == "2026":
            rect(d, (x0,38,x1,104), WHITE)
            rect(d, (x0,105,x1,116), RED)
            rect(d, (x0,117,x1,121), GOLD)
            rect(d, (x0,122,x1,221), NAVY)
        else:
            rect(d, (x0,38,x1,221), WHITE)


def paint_tails(im, kind):
    d = ImageDraw.Draw(im)
    for ox in (0, 580):
        if kind == "uae":
            uae_tail(d, ox)
        elif kind == "classic":
            rect(d, (ox,650,ox+550,948), WHITE)
            # Traditional small flag near the tip, hoist towards the leading edge.
            flag(d, ox+389, 674, 112, 62, slant=13)
            line(d, [(ox+23,936),(ox+407,936)], (91,164,203), 4)
        else:
            rect(d, (ox,650,ox+550,948), WHITE)
            # A large hand-drawn, fluttering flag sweeps with the fin.
            flag(d, ox+367, 668, 160, 205, wave=10, slant=185)
            poly(d, [(ox+8,945),(ox+416,945),(ox+448,869),
                     (ox+370,891),(ox+220,926)], NAVY)
            line(d, [(ox+40,940),(ox+220,923),(ox+370,888),(ox+447,865)], GOLD, 3)


def generate(kind, filename, blank, mask):
    paint = Image.new("RGB", (W*S,H*S), WHITE)
    paint_body(paint, kind)
    paint_tails(paint, kind)
    paint = paint.resize((W,H), Image.Resampling.LANCZOS)
    # Preserve BLANK's original windows and door outlines on every colour.
    detailed = ImageChops.multiply(paint, blank)
    result = Image.composite(detailed, blank, mask)
    result.save(AIRCRAFT / filename, optimize=True)
    print(f"wrote {AIRCRAFT / filename} ({result.width}x{result.height}, RGB)")


def main():
    if not features.check("raqm"):
        raise SystemExit("Pillow must be built with libraqm for shaped Arabic text")
    for font in (SERIF, SERIF_BOLD, SANS, SANS_BOLD):
        if not font.is_file():
            raise SystemExit(f"Missing DejaVu font: {font}")
    blank = Image.open(AIRCRAFT / "BLANK.png").convert("RGB")
    if blank.size != (W,H):
        raise SystemExit("BLANK.png must be the project's 4096x1024 UV template")
    # Neutral pixels are the white aircraft and its grey details. Blue pixels
    # are the atlas background, which must not receive paint. Restrict this to
    # the fuselage, fin and engine islands; leave the rest of BLANK untouched.
    r, _, b = blank.split()
    neutral = ImageChops.subtract(b, r).point(lambda v: 255 if v < 12 else 0)
    islands = Image.new("L", (W,H), 0)
    md = ImageDraw.Draw(islands)
    for box in ((0,0,2357,279),(0,280,2357,562),
                (0,650,1110,948),(2408,38,2680,221),(2735,38,3018,221)):
        md.rectangle(box, fill=255)
    mask = ImageChops.multiply(neutral, islands)
    generate("uae", "UAE.png", blank, mask)
    generate("classic", "AF1_CLASSIC.png", blank, mask)
    generate("2026", "AF1_2026.png", blank, mask)


if __name__ == "__main__":
    main()
