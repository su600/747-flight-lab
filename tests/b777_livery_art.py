"""Original vector livery artwork for the FlightGear 777-200LR / 777F atlases.

Every livery is drawn in orthographic *side view* in aircraft metres (GLB frame:
nose at -x, tail at +x, y up). The port side is viewed from +z with the nose on
the left, the starboard side from -z with the nose on the right; text is never
mirrored, layouts are. No photographs are used; reference photographs only
informed colours and proportions. Brand marks reuse the project's existing
assets/livery-logos/*.png where a tail emblem is needed.
"""
import base64, math
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
LOGOS = ROOT/'assets/livery-logos'

# fuselage centre line / radius along x (metres), measured on the converted GLB
_X = [-25.4, -24.5, -23.5, -22, -20, -18, -16, 22, 24, 26, 28, 30, 32, 34, 36, 37.8]
_YC = [-.9, -.55, -.35, -.2, -.1, 0, 0, 0, .05, .1, .12, .2, .45, .7, .85, .9]
_R = [0, 1.1, 1.6, 2.2, 2.75, 3.0, 3.1, 3.1, 2.85, 2.5, 2.2, 1.85, 1.4, .95, .5, .12]
def yc(x): return float(np.interp(x, _X, _YC))
def rad(x): return float(np.interp(x, _X, _R))
def fz(x, rel): return yc(x)+rel*rad(x)           # rel -1 keel .. 0 axis .. +1 crown

# fin planform (x of leading/trailing edge by height)
def fin_le(y): return 24.4+(y-2.5)*(34.6-24.4)/(12.36-2.5)
def fin_te(y): return 38.0-(y-2.4)*(38.0-37.75)/(12.36-2.4)
def fin_pt(fx, y): return (fin_le(y)+fx*(fin_te(y)-fin_le(y)), y)

# body canvas / fin canvas definitions (consumed by the baker)
BODY = dict(u0=-26.0, u1=39.0, ytop=4.0, ybot=-4.0, ppm=40)
FIN = dict(u0=22.0, u1=40.0, ytop=13.6, ybot=1.4, ppm=64)

DOORS_X = [-18.2, -7.7, 11.7, 24.8]   # port/starboard door centres
WINDOW_X = (-16.9, 23.7)
WINDOW_Y = (0.40, 0.76)

_logo_cache = {}
def logo_uri(name):
    if name not in _logo_cache:
        _logo_cache[name] = 'data:image/png;base64,'+base64.b64encode((LOGOS/name).read_bytes()).decode()
    return _logo_cache[name]


class Canvas:
    """SVG builder in world metres for one side of one canvas."""
    def __init__(self, spec, side):
        self.s = spec; self.side = side
        self.items = []
        if side == 'port':
            self.U0 = spec['u0']
        else:
            self.U0 = -spec['u1']
        self.w = spec['u1']-spec['u0']; self.h = spec['ytop']-spec['ybot']
    def uv(self, x, y):
        u = (x if self.side == 'port' else -x)-self.U0
        return u, self.s['ytop']-y
    def pts(self, points): return ' '.join('%.3f,%.3f' % self.uv(x, y) for x, y in points)
    def rect_all(self, fill): self.items.append(f'<rect x="-1" y="-1" width="{self.w+2}" height="{self.h+2}" fill="{fill}"/>')
    def poly(self, points, fill, opacity=1, stroke=None, sw=0):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
        self.items.append(f'<polygon points="{self.pts(points)}" fill="{fill}" fill-opacity="{opacity}"{st}/>')
    def path(self, cmds, fill='none', stroke=None, sw=0, opacity=1):
        d = []
        for c in cmds:
            op, args = c[0], c[1:]
            d.append(op+' '+' '.join('%.3f,%.3f' % self.uv(*a) for a in args))
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
        self.items.append(f'<path d="{" ".join(d)}" fill="{fill}" fill-opacity="{opacity}"{st}/>')
    def line(self, p0, p1, color, w, cap='butt'):
        u0, v0 = self.uv(*p0); u1, v1 = self.uv(*p1)
        self.items.append(f'<line x1="{u0:.3f}" y1="{v0:.3f}" x2="{u1:.3f}" y2="{v1:.3f}" stroke="{color}" stroke-width="{w}" stroke-linecap="{cap}"/>')
    def circle(self, c, r, fill, stroke=None, sw=0):
        u, v = self.uv(*c); st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
        self.items.append(f'<circle cx="{u:.3f}" cy="{v:.3f}" r="{r}" fill="{fill}"{st}/>')
    def text(self, x, y, s, size, fill, family='Arial', weight='bold', anchor='middle', style='normal', spacing=0, length=None, extra=''):
        u, v = self.uv(x, y)
        a = anchor   # anchors are screen-relative: words keep their reading order on both sides
        tl = f' textLength="{length}" lengthAdjust="spacingAndGlyphs"' if length else ''
        self.items.append(f'<text x="{u:.3f}" y="{v:.3f}" font-family="{family}" font-size="{size}" font-weight="{weight}" font-style="{style}" fill="{fill}" text-anchor="{a}" letter-spacing="{spacing}"{tl} {extra}>{s}</text>')
    def image(self, name, x0, y0, x1, y1, mirror=True, opacity=1, tint=None):
        """Place a logo in the world box; mirrored on the starboard side so it still faces forward."""
        (ua, va), (ub, vb) = self.uv(x0, y1), self.uv(x1, y0)
        uL, uR = min(ua, ub), max(ua, ub); vT, vB = min(va, vb), max(va, vb)
        flip = mirror and self.side != 'port'
        w, h = uR-uL, vB-vT
        tf = f' transform="translate({uL+w:.3f},{vT:.3f}) scale(-1,1)"' if flip else f' transform="translate({uL:.3f},{vT:.3f})"'
        flt = f' filter="url(#{tint})"' if tint else ''
        self.items.append(f'<image width="{w:.3f}" height="{h:.3f}" opacity="{opacity}" href="{logo_uri(name)}" preserveAspectRatio="xMidYMid meet"{tf}{flt}/>')
    def logo(self, name, cx, cy, size, mirror=True, opacity=1, tint=None):
        """Place a square (512px) logo PNG of side `size` metres centred on (cx, cy)."""
        self.image(name, cx-size/2, cy-size/2, cx+size/2, cy+size/2, mirror=mirror, opacity=opacity, tint=tint)
    def raw(self, s): self.items.append(s)
    def svg(self, defs=''):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}">'
                f'<defs>{defs}</defs>'+''.join(self.items)+'</svg>')

# shape helpers ----------------------------------------------------------------------------
def band(x0, x1, rel_lo, rel_hi, step=.5):
    """Polygon between two fuselage-relative curves; rel_* are numbers or callables of x."""
    lo = rel_lo if callable(rel_lo) else (lambda x, v=rel_lo: v)
    hi = rel_hi if callable(rel_hi) else (lambda x, v=rel_hi: v)
    xs = list(np.arange(x0, x1, step))+[x1]
    top = [(x, fz(x, hi(x))) for x in xs]; bot = [(x, fz(x, lo(x))) for x in reversed(xs)]
    return top+bot
def abs_band(x0, x1, y_lo, y_hi, step=.5):
    """Band between absolute y curves (numbers or callables of x)."""
    lo = y_lo if callable(y_lo) else (lambda x, v=y_lo: v)
    hi = y_hi if callable(y_hi) else (lambda x, v=y_hi: v)
    xs = list(np.arange(x0, x1, step))+[x1]
    return [(x, hi(x)) for x in xs]+[(x, lo(x)) for x in reversed(xs)]
def smooth(a, b, x0, x1):
    """Smoothstep from a (at x0) to b (at x1) as a callable."""
    def f(x):
        t = min(1, max(0, (x-x0)/(x1-x0))); t = t*t*(3-2*t); return a+(b-a)*t
    return f
def fin_poly(fx0, fx1, y0, y1):
    """Chord-relative quad on the fin (fx in 0..1 across the chord)."""
    return [fin_pt(fx0, y0), fin_pt(fx1, y0), fin_pt(fx1, y1), fin_pt(fx0, y1)]

def fin_outline_poly(): return [(fin_le(y), y) for y in np.arange(2.0, 12.4, .5)]+[(fin_te(y), y) for y in np.arange(12.4, 1.9, -.5)]


def preview_guides(c, kind='body'):
    """Window band, door frames and the silhouette, drawn on top for layout review only."""
    if kind == 'body':
        xs = np.arange(-25.4, 37.8, .5)
        c.poly([(x, yc(x)+rad(x)) for x in xs]+[(x, yc(x)-rad(x)) for x in xs[::-1]], 'none', stroke='#f0f', sw=.04)
        c.poly([(WINDOW_X[0], WINDOW_Y[0]), (WINDOW_X[1], WINDOW_Y[0]), (WINDOW_X[1], WINDOW_Y[1]), (WINDOW_X[0], WINDOW_Y[1])], '#789', opacity=.55)
        for x in DOORS_X: c.poly([(x-.65, -.49), (x+.65, -.49), (x+.65, 1.64), (x-.65, 1.64)], 'none', stroke='#0a0', sw=.04)
        for x in range(-25, 38, 5): c.text(x, -3.7, str(x), .5, '#000', weight='normal')
    else:
        c.poly(fin_outline_poly(), 'none', stroke='#f0f', sw=.04)
