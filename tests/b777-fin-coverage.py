#!/usr/bin/env python3
"""CPU fin regression against the pinned uncompressed 200LR geometry.

    git show db2577a:assets/accurate-b777/777-200LR-2048.candidate.glb > /tmp/777-pax.glb
    B777_GLB_PAX=/tmp/777-pax.glb python3 tests/b777-fin-coverage.py
    B777_GLB_PAX=/tmp/777-pax.glb node tests/b777-fin-model.mjs

The second command checks the shipped meshopt model against this source.
Requires numpy, OpenCV, Pillow, and @resvg/resvg-js. Text depends on fonts.
"""
import hashlib
import shutil
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
import b777_livery_build as build
from b777_livery_lib import GLB, load_prims, load_rgb, paint, raster_positions

EXPECTED = 'eddb2ea2e615931145b22838921bf12ac90f78b302a4d301f4d7e9439fa574e9'
assert hashlib.sha256(GLB['pax'].read_bytes()).hexdigest() == EXPECTED, 'Use the pinned uncompressed 200LR GLB'
prims = load_prims('pax')
spec = build.sources('pax')['fin']
pos, mask = raster_positions(prims, spec['source'], spec['n'], include=build.FIN_PARTS, tag='pax')
_, other = raster_positions(prims, spec['source'], spec['n'], exclude=build.FIN_PARTS, tag='pax')
assert set(p['name'] for p in prims if p['name'] in build.FIN_PARTS and p['src'] == spec['source']) == build.FIN_PARTS
assert not np.any((mask > 0) & (other > 0)), 'Fin bleed overlaps another atlas user'

# Rasterise the actual 3D triangles in a side-view canvas, not the assumed
# trapezium. Separately test each emblem/text/disc: a union would hide clipping
# when two marks overlap. Rectangles and flag stripes intentionally extend past
# the silhouette, so their coverage is checked against the atlas below instead.
hulls = {}
for side in ('port', 'stbd'):
    s = build.art.FIN
    c = build.art.Canvas(s, side)
    hull = np.zeros((round(c.h*s['ppm']), round(c.w*s['ppm'])), np.uint8)
    for p in prims:
        if p['name'] not in build.FIN_PARTS or p['src'] != spec['source']:
            continue
        xyz = p['pos']
        xy = np.stack([((xyz[:, 0] if side == 'port' else -xyz[:, 0])-c.U0)*s['ppm'],
                       (s['ytop']-xyz[:, 1])*s['ppm']], axis=1)
        for tri in xy[p['idx']]:
            cv2.fillConvexPoly(hull, np.rint(tri).astype(np.int32), 255)
    assert np.count_nonzero(hull) > 100000
    hulls[side] = hull > 0

base = load_rgb(spec['base'], spec['n'])
ids = [ident for ident in build.LIVERIES if ident not in build.CARGO_IDS]
assert len(ids) == 13
for ident in ids:
    canvases = {}
    for side in ('port', 'stbd'):
        f = build.art.Canvas(build.art.FIN, side)
        build.LIVERIES[ident](build.art.Canvas(build.art.BODY, side), f)
        canvases[side] = build.render(f, build.art.FIN)[0]
        items = [item for item in f.items if item.startswith(('<image', '<text', '<circle'))]
        for item in items:
            isolated = build.art.Canvas(build.art.FIN, side)
            isolated.items = [item]
            _, image = build.render(isolated, build.art.FIN)
            alpha = np.asarray(image)[:, :, 3].astype(np.float64)
            total = alpha.sum()
            assert total > 1000, f'{ident} {side}: missing emblem'
            fraction = float(alpha[hulls[side]].sum()/total)
            assert fraction >= .995, f'{ident} {side}: emblem clipped, only {fraction:.3%} on fin'
    expected = np.clip(paint(base, pos, mask, canvases['port'], canvases['stbd'])*255+.5, 0, 255).astype(np.uint8)
    delivered = np.asarray(Image.open(build.OUT/'passenger'/f'{ident}-fin.webp').convert('RGB'))
    error = np.max(np.abs(delivered.astype(np.int16)-expected.astype(np.int16)), axis=2)
    for sign, side in ((1, 'port'), (-1, 'stbd')):
        on = (mask > 0) & (pos[:, :, 2]*sign > 0)
        assert on.sum() > 200000, f'{ident} {side}: missing UV island'
        bad = float(np.mean(error[on] > 40))
        assert bad < .01, f'{ident} {side}: delivered fin differs from artwork on {bad:.2%} of texels'
    print(f'{ident}: both fin sides and delivered atlas OK')

# Exercise the supported selective generator in a throwaway directory: no pixel
# outside the fin mask may change, even after WebP encoding.
with tempfile.TemporaryDirectory() as tmp:
    saved = build.OUT
    try:
        build.OUT = Path(tmp)
        dest = build.OUT/'passenger'/'BOE-fin.webp'
        dest.parent.mkdir(parents=True)
        shutil.copyfile(saved/'passenger'/'BOE-fin.webp', dest)
        before = np.asarray(Image.open(dest).convert('RGB')).copy()
        build.build_one('BOE', fin_only=True, prims_cache={'pax': prims})
        after = np.asarray(Image.open(dest).convert('RGB'))
        assert np.array_equal(before[mask == 0], after[mask == 0]), 'Non-fin pixels changed'
        assert np.array_equal(before[other > 0], after[other > 0]), 'Another atlas part changed'
    finally:
        build.OUT = saved
print('777 fin-only regeneration: non-fin pixels unchanged')
