#!/usr/bin/env python3
"""Bake the 777 liveries onto the FlightGear atlases.

  python tests/b777_livery_build.py preview UAE [BOE ...]   # side-view art + guides -> $B777_PREVIEW (default %TEMP%)
  python tests/b777_livery_build.py build   UAE [BOE ...]   # write assets/b777-liveries/{passenger,cargo}/<ID>-*.webp
  python tests/b777_livery_build.py build all

Requires Pillow, numpy, opencv-python, Node with @resvg/resvg-js (global install is found automatically).
Everything is drawn from original vector shapes (see b777_livery_art.py); no photographs are copied.
"""
import os, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from PIL import Image
from b777_livery_lib import *
import b777_livery_art as art
from b777_liveries import LIVERIES, CARGO_IDS

OUT = ROOT/'assets/b777-liveries'
PREVIEW = Path(os.environ.get('B777_PREVIEW', tempfile.gettempdir()))/'b777-preview'
FIN_PARTS = {'Tail', 'Rudder', 'LRudder'}

# source atlas, bake size, neutral base image, restrict-to-parts (None = every mesh using the atlas)
def sources(variant):
    pax = variant == 'pax'
    pre = 'Liveries-200LR/' if pax else 'Liveries-F/'
    base_pax = SRC/'source-textures/passenger200lr2048'
    base_cargo = SRC/'production-textures/cargo'
    return {
     'body': dict(source=pre+'AFR1blanc.png', n=2048,
                  base=(OUT/'passenger/research-neutral/AFR1blanc.png') if pax else 'cargo-neutral'),
     'fin': dict(source=pre+'AFR5blanc.png', n=2048, include=FIN_PARTS,
                 base=(SRC/'source-textures/passenger200lr/AFR5blanc.png') if pax else (SRC/'source-textures/cargo/AFR5blanc.png')),
     'doors': dict(source=pre+'AFR4blanc.png', n=1024, base=(base_pax if pax else base_cargo)/'AFR4blanc.png'),
     'belly': dict(source=pre+'AFR3.png', n=1024, base=(base_pax if pax else base_cargo)/'AFR3.png'),
     'eng': dict(source=pre+'AFR8LAT.png', n=1024, base=(base_pax if pax else base_cargo)/'AFR8LAT.png'),
    }

def canvas_pair(spec, draw_fn, scale=1):
    out = {}
    for side in ('port', 'stbd'):
        c = art.Canvas(spec, 'port' if side == 'port' else 'stbd')
        draw_fn(c)
        out[side] = c
    return out

WHITE_FILTER = ('<filter id="white"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/></filter>'
                '<filter id="gold"><feColorMatrix type="matrix" values="0 0 0 0 .96 0 0 0 0 .72 0 0 0 0 .04 0 0 0 1 0"/></filter>')
def render(c, spec, defs=WHITE_FILTER, guides=None):
    if guides: guides(c)
    img = render_svg(c.svg(defs), int(round(c.w*spec['ppm'])))
    return SideCanvas(img, c.U0, spec['ytop'], spec['ppm']), img

def build_one(ident, write=True, prims_cache={}):
    L = LIVERIES[ident]
    variant = 'cargo' if ident in CARGO_IDS else 'pax'
    if variant not in prims_cache: prims_cache[variant] = load_prims(variant)
    prims = prims_cache[variant]
    # draw artwork once per side, for body and fin canvases
    body = {s: art.Canvas(art.BODY, s) for s in ('port', 'stbd')}
    fin = {s: art.Canvas(art.FIN, s) for s in ('port', 'stbd')}
    extras = {}
    for s in ('port', 'stbd'):
        r = L(body[s], fin[s])
        if r: extras = r
    body_canvas = {s: render(body[s], art.BODY)[0] for s in body}
    fin_canvas = {s: render(fin[s], art.FIN)[0] for s in fin}
    outdir = OUT/('cargo' if variant == 'cargo' else 'passenger'); outdir.mkdir(parents=True, exist_ok=True)
    produced = []
    for name, spec in sources(variant).items():
        if name == 'eng':
            continue
        n = spec['n']
        pos, mask = raster_positions(prims, spec['source'], n, include=spec.get('include'), tag=variant)
        base = cargo_neutral_body() if spec['base'] == 'cargo-neutral' else load_rgb(spec['base'], n)
        canv = fin_canvas if name == 'fin' else body_canvas
        painted = paint(base, pos, mask, canv['port'], canv['stbd'])
        if name == 'fin' and not (mask > 0).any(): continue
        if write:
            save_webp(painted, outdir/f'{ident}-{name}.webp', 90 if n >= 2048 else 92)
            produced.append(name)
    # engines: simple two-tone nacelle paint (optional)
    eng = extras.get('engine')
    if eng:
        spec = sources(variant)['eng']; n = spec['n']
        pos, mask = raster_positions(prims, spec['source'], n, tag=variant)
        base = load_rgb(spec['base'], n)
        painted = paint_engine(base, pos, mask, eng)
        if write:
            save_webp(painted, outdir/f'{ident}-eng.webp', 92); produced.append('eng')
    return produced, extras

_cn = {}
def cargo_neutral_body():
    # remove the blue Boeing / F-GSPF marks of the 777F source (boxes in 1024px atlas coordinates)
    import cv2
    if 'a' not in _cn:
        im = np.asarray(Image.open(SRC/'source-textures/cargo/AFR1blanc.png').convert('RGB')).copy()
        r, g, b = [im[:, :, i].astype(np.int16) for i in range(3)]
        blue = (b-r > 4) & (b-g > 2) & (b < 245) & (r < 200)
        mask = np.zeros(im.shape[:2], np.uint8)
        for x0, y0, x1, y1 in [(15, 70, 235, 100), (15, 198, 235, 228), (115, 425, 155, 470), (490, 508, 585, 535), (490, 636, 585, 665)]:
            mask[y0*4:y1*4, x0*4:x1*4] = blue[y0*4:y1*4, x0*4:x1*4].astype(np.uint8)*255
        mask = cv2.dilate(mask, np.ones((9, 9), np.uint8))
        out = cv2.inpaint(im, mask, 5, cv2.INPAINT_TELEA)
        _cn['a'] = np.asarray(Image.fromarray(out).resize((2048, 2048), Image.Resampling.LANCZOS), np.float32)/255
    return _cn['a']

ENG_Y, ENG_ZC, ENG_R = -2.91, 9.89, 1.98
def paint_engine(base, pos, mask, spec):
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    on = (mask > 0) & (np.abs(y-ENG_Y) < 2.6) & (np.abs(np.abs(z)-ENG_ZC) < 2.4) & (x < 2.5) & (x > -6.5)
    rel = (y-ENG_Y)/ENG_R
    col = np.zeros(base.shape, np.float32); col[:] = _hex(spec.get('base', '#ffffff'))
    if 'lower' in spec:
        low = _hex(spec['lower']); split = spec.get('split', -.1); soft = .12
        t = np.clip((split-rel)/soft+.5, 0, 1)[..., None]
        col = col*(1-t)+low*t
    if 'rear' in spec:
        t = np.clip((x-spec.get('rear_x', -1.5))/.25, 0, 1)[..., None]
        col = col*(1-t)+_hex(spec['rear'])*t
    w = np.clip((luma(base)-.70)/.18, 0, 1)[..., None]*on[..., None]
    return base*(1-w)+base*col*w

def _hex(h):
    h = h.lstrip('#'); return np.array([int(h[i:i+2], 16)/255 for i in (0, 2, 4)], np.float32)

def preview(ident):
    PREVIEW.mkdir(parents=True, exist_ok=True)
    L = LIVERIES[ident]
    for side in ('port', 'stbd'):
        b = art.Canvas(art.BODY, side); f = art.Canvas(art.FIN, side)
        L(b, f)
        _, img = render(b, art.BODY, guides=lambda c: art.preview_guides(c, 'body'))
        bg = Image.new('RGBA', img.size, '#9ac'); bg.alpha_composite(img)
        bg.convert('RGB').save(PREVIEW/f'{ident}_body_{side}.png')
        _, img = render(f, art.FIN, guides=lambda c: art.preview_guides(c, 'fin'))
        bg = Image.new('RGBA', img.size, '#9ac'); bg.alpha_composite(img)
        bg.convert('RGB').save(PREVIEW/f'{ident}_fin_{side}.png')
    print('preview ->', PREVIEW)

if __name__ == '__main__':
    cmd, ids = sys.argv[1], sys.argv[2:]
    if ids == ['all']: ids = list(LIVERIES)
    for i in ids:
        if cmd == 'preview': preview(i)
        else: print(i, build_one(i))
