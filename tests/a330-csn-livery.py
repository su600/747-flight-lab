#!/usr/bin/env python3
"""CSN glyphs on both actual A330 hull UV islands, not just atlas appearance."""
from hashlib import sha256
import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[1]
module = importlib.util.spec_from_file_location('csn_generator', ROOT/'assets/accurate-a330/generate_csn_livery.py')
generator = importlib.util.module_from_spec(module)
module.loader.exec_module(generator)


def hull_uv_point(px, py):
    """Interpolate the real AC fuselage at an atlas point; return local XYZ and dx/du."""
    lines = (ROOT/'assets/accurate-a330/Models/a330-300-main.ac').read_text().splitlines()
    marker = ['OBJECT poly', 'name "fuselage"', 'loc 18.0097 2.12429 -0.00130807', 'texture "323_blank.png"']
    starts = [i for i in range(len(lines)-4) if lines[i:i+4] == marker]
    assert len(starts) == 1, 'fuselage mesh changed: re-audit CSN UVs'
    i = starts[0]
    end = next(j for j in range(i, len(lines)) if lines[j].startswith('kids '))
    block = lines[i:end]
    loc = np.array([18.0097, 2.12429, -0.00130807])
    j = next(j for j, s in enumerate(block) if s.startswith('numvert '))
    count = int(block[j].split()[1])
    verts = np.array([[float(v) for v in s.split()] for s in block[j+1:j+1+count]]) + loc
    for j, s in enumerate(block):
        if not s.startswith('refs '):
            continue
        refs = [r.split() for r in block[j+1:j+1+int(s.split()[1])]]
        for k in range(1, len(refs)-1):
            face = [refs[0], refs[k], refs[k+1]]
            uv = np.array([[float(r[1]), float(r[2])] for r in face])
            matrix = np.vstack((uv.T, np.ones(3)))
            if abs(np.linalg.det(matrix)) < 1e-10:
                continue
            weights = np.linalg.solve(matrix, [px/2048, 1-py/1024, 1])
            if min(weights) >= -1e-7:
                xyz = verts[[int(r[0]) for r in face]]
                return weights @ xyz, np.linalg.solve(matrix.T, xyz[:, 0])[0]
    raise AssertionError(f'No hull triangle covers {px}, {py}')


def diff(a, b):
    return sum(ImageStat.Stat(ImageChops.difference(a.convert('RGB'), b.convert('RGB'))).mean)


# AC nose is -X: z<0 is starboard. These triangles establish that increasing
# image X follows the screen-right direction on *both* natural side views.
stbd, ds = hull_uv_point(1699, 370)
port, dp = hull_uv_point(400, 856)
assert stbd[2] < -1 and port[2] > 1, (stbd, port)
assert ds < -10 and dp > 10, (ds, dp)

assert sha256(generator.SOURCE.read_bytes()).hexdigest() == generator.SOURCE_SHA256
with Image.open(generator.SOURCE) as upstream, Image.open(generator.OUTPUT) as current:
    upstream, current = upstream.copy(), current.copy()
    # Independently measured glyph boxes and matching port positions. Compare all
    # six, not just 方: several symmetric-looking glyphs were mirrored too.
    glyphs = [
        ('中', (1528,351,1559,387), (228,838)),
        ('国', (1580,353,1611,387), (280,839)),
        ('南', (1630,352,1663,387), (330,838)),
        ('方', (1683,352,1716,387), (384,838)),
        ('航', (1734,352,1770,387), (435,838)),
        ('空', (1787,352,1820,387), (488,838)),
    ]
    for char, box, (x, y) in glyphs:
        w, h = box[2]-box[0], box[3]-box[1]
        ref = current.crop((x, y, x+w, y+h))
        actual = current.crop(box)
        straight = diff(actual, ref)
        mirrored = diff(actual.transpose(Image.Transpose.FLIP_LEFT_RIGHT), ref)
        assert straight < 2 and straight + 10 < mirrored, (char, straight, mirrored)
        assert diff(upstream.crop((x, y, x+w, y+h)), ref) == 0, char
    assert np.array_equal(np.asarray(generator.corrected(upstream)), np.asarray(current)), 'runtime texture not regenerated'
    outside = np.ones((1024, 2048), dtype=bool)
    for _, (x0, y0, x1, y1), _ in glyphs:
        outside[y0:y1, x0:x1] = False
    assert np.array_equal(np.asarray(current)[outside], np.asarray(upstream)[outside]), 'pixels outside the six glyphs changed'
print('a330-csn-livery: real hull UV sides, six glyph orientations and pixel isolation passed')
