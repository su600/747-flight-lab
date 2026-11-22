#!/usr/bin/env python3
"""Asset and fin-UV regression checks. Run: python3 tests/ana_747_art.py"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SIZE = (4096, 1024)
atlas = Image.open(ROOT / 'assets/aircraft/ANA.png').convert('RGB')
logo = Image.open(ROOT / 'assets/livery-logos/ana-blue.png').convert('RGBA')
assert atlas.size == SIZE
assert logo.width >= 300 and logo.height >= 80
assert logo.getchannel('A').getextrema() == (0, 255)
assert atlas.getpixel((1000, 175)) == atlas.getpixel((1357, 457)), 'mirrored main-deck blue band'
assert atlas.getpixel((1000, 230)) == atlas.getpixel((1357, 512)), 'mirrored gray belly'
for x, y in ((444,108), (1914,390)):
    rgb = np.asarray(atlas.crop((x-70,y-18,x+70,y+18)))
    blue = (rgb[:,:,2] > rgb[:,:,0]*1.5) & (rgb[:,:,0] < 60)
    assert blue.sum() > 600, 'forward ANA title missing'
for x in (100, 800):
    # Window centres stay dark; dark paint is not used as a proxy for glass.
    a = np.asarray(atlas.crop((x, 145, x+50, 165)))
    assert ((a.max(axis=2) < 70).sum()) > 10, 'main deck windows missing'

# Rasterize the actual AC3D fin/rudder UV polygons, split by physical side.
# This detects logos that look plausible on the atlas but fall outside a fin.
lines = (ROOT / 'assets/aircraft/747-400_fuselage.ac').read_text().splitlines()
masks = [Image.new('1', SIZE), Image.new('1', SIZE)]
for name in ('vstab', 'rudder'):
    i = lines.index(f'name "{name}"') + 1
    vertices = []
    while i < len(lines):
        parts = lines[i].split(); i += 1
        if not parts:
            continue
        if parts[0] == 'numvert':
            for _ in range(int(parts[1])):
                vertices.append(tuple(map(float, lines[i].split()))); i += 1
        elif parts[0] == 'refs':
            refs = []
            for _ in range(int(parts[1])):
                p = lines[i].split(); i += 1
                refs.append((int(p[0]), float(p[1]), float(p[2])))
            z = sum(vertices[r[0]][2] for r in refs) / len(refs)
            if abs(z) > .02:
                points = [(round(u*SIZE[0]), round((1-v)*SIZE[1])) for _, u, v in refs]
                ImageDraw.Draw(masks[0 if z > 0 else 1]).polygon(points, fill=1)
        elif parts[0] == 'kids':
            break
pixels = np.asarray(atlas)
for i, (x0, x1) in enumerate(((0,550), (575,1125))):
    region = pixels[650:950, x0:x1]
    white = (region.min(axis=2) > 235)
    visible = np.asarray(masks[i])[650:950, x0:x1]
    count, projected = int(white.sum()), int((white & visible).sum())
    assert count > 2500, f'fin {i}: missing white ANA'
    assert projected/count > .95, f'fin {i}: lettering outside mesh: {projected}/{count}'
    print(f'fin {i}: {projected}/{count} white lettering pixels lie on actual fin UVs')
print('ANA 747 asset, body details and both fin UV checks passed')
