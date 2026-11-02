#!/usr/bin/env python3
"""Create smaller WebP delivery copies of the original 777 livery atlases.

The PNGs remain the editable source. Requires Pillow with WebP support.
Run from the project root: python3 tools/optimize-b777-liveries.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'assets' / 'b777-liveries'
IDS = {
    'passenger': ('BOE', 'CCA', 'CEA', 'CSN', 'CHH', 'UAE', 'BAW', 'KLM', 'DLH', 'DLH100', 'AF1_CLASSIC', 'AF1_2026'),
    'cargo': ('fedex', 'sf'),
}
for variant, names in IDS.items():
    for name in names:
        for part in ('body', 'fin'):
            source = ROOT / variant / f'{name}-{part}.png'
            target = source.with_suffix('.webp')
            with Image.open(source) as image:
                if image.size != (2048, 2048):
                    raise ValueError(f'Unexpected dimensions: {source}')
                image.convert('RGB').save(target, 'WEBP', quality=92, method=4)
            with Image.open(target) as converted:
                if converted.size != (2048, 2048) or converted.format != 'WEBP':
                    raise ValueError(f'Invalid output: {target}')
            print(f'{target.relative_to(ROOT)}: {source.stat().st_size} -> {target.stat().st_size} bytes')
