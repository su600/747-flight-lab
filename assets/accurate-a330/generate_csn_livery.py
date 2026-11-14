#!/usr/bin/env python3
"""Correct the A330 CSN starboard wordmark in the upstream GPL-2.0 atlas.

CSN-upstream.png is the original FlightGear A333RR/CSN.png from the revision
in NOTICE. CSN.png is the derived runtime texture. On the starboard hull UV
island the six glyphs were individually mirrored, although their order and the
Latin title were already correct. Reflect only those six glyph rectangles;
never mirror the hull island, adjacent paint, or the correctly oriented port.
Run from anywhere: python3 assets/accurate-a330/generate_csn_livery.py
"""
from hashlib import sha256
from pathlib import Path
from PIL import Image

LIVERIES = Path(__file__).resolve().parent / 'Models/Liveries/A333RR'
SOURCE = LIVERIES / 'CSN-upstream.png'
OUTPUT = LIVERIES / 'CSN.png'
SOURCE_SHA256 = '6f9c418e4c4b0c2e60aeff0dfe3e0833a892bdd4a1d0280741b4f6722fdc8c3c'
# Tight bounds in the 2048x1024 atlas, left to right: 中 国 南 方 航 空.
# The port copies below the atlas midline serve as an independent orientation
# reference. Bounds stop above the windows, leaving all other UV islands alone.
STARBOARD_GLYPHS = (
    (1528, 351, 1559, 387), (1580, 353, 1611, 387),
    (1630, 352, 1663, 387), (1683, 352, 1716, 387),
    (1734, 352, 1770, 387), (1787, 352, 1820, 387),
)


def corrected(source):
    if source.size != (2048, 1024) or source.mode != 'RGBA':
        raise ValueError('Unexpected CSN atlas; re-audit the hull UV and glyph bounds')
    out = source.copy()
    for box in STARBOARD_GLYPHS:
        out.paste(source.crop(box).transpose(Image.Transpose.FLIP_LEFT_RIGHT), box[:2])
    return out


def main():
    if sha256(SOURCE.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError('Upstream CSN atlas changed; re-audit before generating')
    with Image.open(SOURCE) as source:
        corrected(source).save(OUTPUT, dpi=source.info.get('dpi', (72, 72)), optimize=True)
    print(f'wrote {OUTPUT}')


if __name__ == '__main__':
    main()
