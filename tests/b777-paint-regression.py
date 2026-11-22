#!/usr/bin/env python3
"""CPU projection regression for the changed 777 paint.

Use the pinned uncompressed originals (the shipped GLBs use meshopt):
  git show db2577a:assets/accurate-b777/777-200LR-2048.candidate.glb > /tmp/777-pax.glb
  git show db2577a:assets/accurate-b777/777-200F-refined.candidate.glb > /tmp/777-f.glb
  B777_GLB_PAX=/tmp/777-pax.glb B777_GLB_CARGO=/tmp/777-f.glb python3 tests/b777-paint-regression.py
Needs Pillow, numpy, OpenCV, resvg and the same fonts used for baking.
Checks projection/encoding, not historical paint accuracy or animated poses.
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

for variant, digest in [('pax', 'eddb2ea2e615931145b22838921bf12ac90f78b302a4d301f4d7e9439fa574e9'),
                        ('cargo', '33dabdc6d8b80b9f869f74c4cbc2764b7dafd910c4a38f90594984a9bbc0ce17')]:
    assert hashlib.sha256(GLB[variant].read_bytes()).hexdigest() == digest, f'{variant}: use pinned GLB'

# Compare the changed skins with a fresh projection. In particular AFR3 carries
# the separate starboard cargo-door skin: forgetting it produces shifted glyphs.
for variant, ident, names in [('pax', 'BOE', ('body', 'belly')), ('pax', 'UAE', ('body', 'doors', 'belly', 'fin')),
                              ('pax', 'ANA', ('body', 'doors', 'belly', 'fin')),
                              ('cargo', 'fedex', ('fin',))]:
    prims = load_prims(variant)
    canv = {}
    for side in ('port', 'stbd'):
        body, fin = build.art.Canvas(build.art.BODY, side), build.art.Canvas(build.art.FIN, side)
        build.LIVERIES[ident](body, fin)
        canv[side] = {'body': build.render(body, build.art.BODY)[0], 'fin': build.render(fin, build.art.FIN)[0]}
    for name in names:
        spec = build.sources(variant)[name]
        pos, mask = raster_positions(prims, spec['source'], spec['n'], include=spec.get('include'), tag=variant)
        base = build.cargo_neutral_body() if spec['base'] == 'cargo-neutral' else load_rgb(spec['base'], spec['n'])
        kind = 'fin' if name == 'fin' else 'body'
        expected = np.clip(paint(base, pos, mask, canv['port'][kind], canv['stbd'][kind])*255+.5, 0, 255).astype(np.uint8)
        target = build.OUT/('passenger' if variant == 'pax' else 'cargo')/f'{ident}-{name}.webp'
        actual = np.asarray(Image.open(target).convert('RGB'))
        err = np.max(np.abs(actual.astype(np.int16)-expected.astype(np.int16)), axis=2)
        for sign, side in [(1, 'port'), (-1, 'stbd')]:
            selected = (mask > 0) & (pos[:, :, 2]*sign > 0)
            assert selected.sum() > 1000, (ident, name, side)
            bad = np.mean(err[selected] > 40)
            # 1024px belly/door WebPs are lossy; shared island boundaries
            # may differ sharply even when the projected interior is correct.
            assert bad < .04, (ident, name, side, bad)
        print(ident, name, 'both sides projected')
        del pos, mask, base, expected, actual, err

# FedEx fin mark: independently check each text fragment against the actual
# cargo fin silhouette on both sides (a union would hide a clipped fragment).
prims = load_prims('cargo'); spec = build.sources('cargo')['fin']
for side in ('port', 'stbd'):
    s = build.art.FIN; f = build.art.Canvas(s, side)
    build.LIVERIES['fedex'](build.art.Canvas(build.art.BODY, side), f)
    hull = np.zeros((round(f.h*s['ppm']), round(f.w*s['ppm'])), np.uint8)
    for p in prims:
        if p['name'] not in build.FIN_PARTS or p['src'] != spec['source']: continue
        xyz = p['pos']
        xy = np.stack([((xyz[:, 0] if side == 'port' else -xyz[:, 0])-f.U0)*s['ppm'],
                       (s['ytop']-xyz[:, 1])*s['ppm']], axis=1)
        for tri in xy[p['idx']]: cv2.fillConvexPoly(hull, np.rint(tri).astype(np.int32), 255)
    assert np.count_nonzero(hull) > 100000
    for item in (item for item in f.items if item.startswith('<text')):
        c = build.art.Canvas(s, side); c.items = [item]
        _, image = build.render(c, s)
        alpha = np.asarray(image)[:, :, 3].astype(np.float64)
        assert alpha.sum() > 1000 and alpha[hull > 0].sum()/alpha.sum() >= .995, (side, item)
print('FedEx fin marks fit both actual silhouettes')

# Selective lossy update must not paint another user of AFR5. Re-encoding is
# permitted but bounded; the separate legacy fin command remains lossless.
pos, mask = raster_positions(prims, spec['source'], spec['n'], include=build.FIN_PARTS, tag='cargo')
_, other = raster_positions(prims, spec['source'], spec['n'], exclude=build.FIN_PARTS, tag='cargo')
assert not np.any((mask > 0) & (other > 0))
with tempfile.TemporaryDirectory() as tmp:
    saved = build.OUT
    try:
        build.OUT = Path(tmp); dest = build.OUT/'cargo'/'fedex-fin.webp'; dest.parent.mkdir(parents=True)
        shutil.copyfile(saved/'cargo'/'fedex-fin.webp', dest)
        before = np.asarray(Image.open(dest).convert('RGB')).astype(np.int16)
        assert build.build_one('fedex', prims_cache={'cargo': prims}, parts=['fin'])[0] == ['fin']
        after = np.asarray(Image.open(dest).convert('RGB')).astype(np.int16)
        err = np.abs(after-before)[mask == 0]
        assert err.mean() < 1 and np.mean(err > 15) < .005, (err.mean(), np.mean(err > 15))
        assert dest.stat().st_size <= 350000
    finally:
        build.OUT = saved
print('Selective fin update: bounded non-fin encoding drift and size')
