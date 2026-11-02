#!/usr/bin/env python3
"""Generate an experimental windowless *passenger-conversion* UV atlas.

Uses only the unmodified upstream 323_blank.png and the checked, inclusive
window-footprints.json. This does not change doors, cockpit glass, tail or
engines, nor create a 3D freighter cargo-door opening. Requires Pillow.
See NOTICE for upstream GPL-2.0 provenance and research limitations.
"""
from hashlib import sha256
from pathlib import Path
import json
from PIL import Image, PngImagePlugin

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'Models' / '323_blank.png'
DEST = HERE / 'derived' / '323_windowless.png'


def generate():
    info = json.loads((HERE / 'window-footprints.json').read_text(encoding='utf-8'))
    if sha256(SOURCE.read_bytes()).hexdigest() != info['source_sha256']:
        raise ValueError('Upstream texture changed: UV footprints must be re-reviewed')
    original = Image.open(SOURCE).convert('RGBA')
    if original.size != (2048, 1024) or [len(r) for r in info['rows']] != [69, 69]:
        raise ValueError('Unexpected atlas size/window footprint count')
    image = original.copy()
    src, dst = original.load(), image.load()
    # Interpolate from just above and below each window, retaining a vertical
    # panel seam where it crosses a window. Only the inclusive footprint plus
    # one-pixel antialias halo is modified; no row-wide fill over doors.
    for row in info['rows']:
        for x0, y0, x1, y1 in row:
            x0 -= 1; y0 -= 1; x1 += 1; y1 += 1
            for x in range(x0, x1 + 1):
                top, bottom = src[x, y0 - 1], src[x, y1 + 1]
                for y in range(y0, y1 + 1):
                    t = (y - y0 + 1) / (y1 - y0 + 2)
                    dst[x, y] = tuple(round(a * (1 - t) + b * t) for a, b in zip(top, bottom))
    DEST.parent.mkdir(parents=True, exist_ok=True)
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text('Description', 'Experimental windowless conversion of FlightGear Airbus_A330 323_blank.png; see ../NOTICE and ../LICENSE. Not an Airbus A330 factory freighter.')
    image.save(DEST, 'PNG', pnginfo=metadata, optimize=True)
    print(f'{DEST}: {sum(map(len, info["rows"]))} window footprints')


if __name__ == '__main__':
    generate()
