#!/usr/bin/env python3
"""Prepare required FlightGear 777 PNGs, one image per process. GPL-2.0 data.

This never downloads a repository archive. Originals are retained for source
and reproducibility. See assets/accurate-b777/CREDITS.txt.
"""
import argparse
import gc
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'assets' / 'accurate-b777'
DEFAULT_REV = 'cfa61378d1210a33e0520d4459d0baf1cf1511f5'
DEFAULT_REPOSITORY = 'franck-vmd/Boeing-777-Flightgear'
VARIANTS = json.loads((Path(__file__).with_name('convert-b777-variants.json')).read_text())
CONFIG = {key: (value['ac'], value['xml'], value['white'], value['textureDirectory'])
          for key, value in VARIANTS.items()}


def memory(minimum):
    with open('/proc/meminfo') as f:
        available = next(int(l.split()[1]) // 1024 for l in f if l.startswith('MemAvailable:'))
    if available < minimum:
        raise RuntimeError(f'Only {available} MiB available; need {minimum} MiB')


def paths(variant):
    ac, xml, white, directory = CONFIG[variant]
    livery = ET.parse(ROOT / white).getroot()
    overrides = {}
    slots = {}
    for animation in ET.parse(ROOT / xml).getroot().findall('animation'):
        if animation.findtext('type') != 'material':
            continue
        prop = animation.findtext('property-base')
        if prop:
            if not prop.startswith('sim/model/'):
                raise ValueError(f'Unknown material property {prop}')
            value = livery.findtext('sim/model/' + prop.split('/')[-1] + '/texture')
        else:
            value = animation.findtext('texture')
        if not value:
            continue
        if '/' not in value:
            value = directory + '/' + value
        if not value.startswith(directory + '/'):
            raise ValueError(f'Unexpected model texture path {value}')
        for name in animation.findall('object-name'):
            name = name.text.strip()
            # Some pinned upstream XML names a PNG that is absent in that
            # variant. Keep the AC object's own texture, never borrow another
            # variant's atlas silently; retain this limitation in the manifest.
            if VARIANTS[variant].get('unresolvedTextureOverrides', {}).get(name) == value:
                continue
            if name in overrides and overrides[name] != value:
                raise ValueError(f'Conflicting texture mappings: {name}')
            overrides[name] = value
            if prop:
                slots[name] = prop
    used = set()
    current = None
    with (ROOT / ac).open() as f:
        for line in f:
            if line.startswith('name '):
                current = line.strip()[6:-1]
            elif line.startswith('texture '):
                name = line.strip()[9:-1].split('/')[-1]
                used.add(overrides.get(current, directory + '/' + name))
    used.update(overrides.values())
    return sorted(used), overrides, slots


def get_source(variant, rel):
    directory = CONFIG[variant][3]
    if not rel.startswith(directory + '/') or '/' in rel[len(directory)+1:]:
        raise ValueError(rel)
    name = rel[len(directory)+1:]
    originals = ROOT / 'source-textures' / variant
    originals.mkdir(parents=True, exist_ok=True)
    target = originals / name
    if target.exists():
        return target
    old = ROOT / 'originals' / name
    if variant == 'passenger' and old.exists():
        shutil.copyfile(old, target)
        return target
    partial = target.with_suffix(target.suffix + '.part')
    try:
        repo = VARIANTS[variant].get('repository', DEFAULT_REPOSITORY)
        revision = VARIANTS[variant].get('revision', DEFAULT_REV)
        if repo not in (DEFAULT_REPOSITORY, 'franck-vmd/Boeing-777-Flightgear-2048') or len(revision) != 40 or any(c not in '0123456789abcdef' for c in revision):
            raise ValueError('Unapproved or unpinned upstream source')
        url = f'https://raw.githubusercontent.com/{repo}/{revision}/777-VMD/Models/'
        req = urllib.request.Request(url + urllib.parse.quote(rel), headers={'User-Agent': '777-asset-conversion'})
        with urllib.request.urlopen(req, timeout=60) as response, partial.open('wb') as out:
            while block := response.read(256 * 1024):
                out.write(block)
        partial.replace(target)
    finally:
        partial.unlink(missing_ok=True)
    return target


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as f:
        while block := f.read(256 * 1024):
            digest.update(block)
    return digest.hexdigest()


def work(variant, rel, reuse_existing=False):
    from PIL import Image
    import resource
    name = Path(rel).name
    prior_source = ROOT / 'source-textures' / variant / name
    prior_output = ROOT / 'production-textures' / variant / name
    # Resume reads only a maximum-1024 PNG (measured ~31 MiB RSS); a fresh
    # source-resolution conversion still needs the full 512 MiB guard.
    resuming = reuse_existing and prior_source.exists() and prior_output.exists()
    memory(400 if resuming else 512)
    source = get_source(variant, rel)
    output = ROOT / 'production-textures' / variant / source.name
    output.parent.mkdir(parents=True, exist_ok=True)
    digest = sha256_file(source)
    if resuming:
        # Explicit resume for an interrupted sequential run. Inspect only the
        # original header and one 1024 result; no source-resolution decode.
        with Image.open(source) as image:
            dims = list(image.size)
        ratio = min(1.0, 1024 / max(dims))
        expected = tuple(max(1, round(d * ratio)) for d in dims)
        with Image.open(output) as image:
            if image.mode != 'RGBA' or image.size != expected:
                raise ValueError(f'Cannot resume invalid output {output}')
            image.load()
            alpha = image.getchannel('A').getextrema()
        return {'path': rel, 'name': source.name, 'source_size': dims, 'size': list(expected),
                'source_sha256': digest, 'output_sha256': sha256_file(output), 'alpha_range': list(alpha),
                'bytes': output.stat().st_size, 'reused_existing': True,
                'peak_rss_kib': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
    with Image.open(source) as image:
        dims = list(image.size)
        image.load()
        pixels = image if image.mode in ('RGB', 'RGBA', 'L', 'LA') else image.convert('RGBA')
        ratio = min(1.0, 1024 / max(image.size))
        size = tuple(max(1, round(d * ratio)) for d in image.size)
        reduced = pixels.resize(size, Image.Resampling.LANCZOS, reducing_gap=2.0).convert('RGBA')
        alpha = reduced.getchannel('A').getextrema()
        partial = output.with_suffix('.png.part')
        try:
            reduced.save(partial, format='PNG', compress_level=6)
            partial.replace(output)
        finally:
            partial.unlink(missing_ok=True)
        reduced.close()
    gc.collect()
    return {'path': rel, 'name': source.name, 'source_size': dims, 'size': list(size),
            'source_sha256': digest, 'output_sha256': sha256_file(output), 'alpha_range': list(alpha),
            'bytes': output.stat().st_size, 'peak_rss_kib': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('variant', choices=CONFIG)
    p.add_argument('--one', help=argparse.SUPPRESS)
    p.add_argument('--refresh-manifest', action='store_true', help='Update XML mapping without resizing images')
    p.add_argument('--resume', action='store_true', help='Reuse already produced 1024 PNGs after an interrupted run')
    args = p.parse_args()
    if VARIANTS[args.variant].get('textureVariant'):
        raise ValueError(f"Use existing texture variant {VARIANTS[args.variant]['textureVariant']}")
    if args.one:
        print(json.dumps(work(args.variant, args.one, args.resume)))
        return
    needed, overrides, slots = paths(args.variant)
    target = ROOT / ('production-textures-' + args.variant + '.json')
    rows = []
    if args.refresh_manifest:
        previous = json.loads(target.read_text())
        rows = previous['textures']
        if {row['path'] for row in rows} != set(needed):
            raise ValueError('Texture set changed; rerun conversion')
    for index, rel in enumerate([] if args.refresh_manifest else needed, 1):
        print(f'{args.variant} [{index}/{len(needed)}] {rel}', file=sys.stderr, flush=True)
        name = Path(rel).name
        cache = ROOT / 'texture-progress' / args.variant / (hashlib.sha256(rel.encode()).hexdigest() + '.json')
        src = ROOT / 'source-textures' / args.variant / name
        out = ROOT / 'production-textures' / args.variant / name
        if args.resume and cache.exists() and src.exists() and out.exists():
            saved = json.loads(cache.read_text())
            if (saved.get('path') == rel and saved.get('source_sha256') == sha256_file(src)
                    and saved.get('output_sha256') == sha256_file(out)):
                rows.append(saved)
                continue
        memory(400 if args.resume and src.exists() and out.exists() else 512)
        cmd = [sys.executable, __file__, args.variant, '--one', rel]
        if args.resume:
            cmd.append('--resume')
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode:
            sys.stderr.write(r.stderr)
            raise RuntimeError(f'Texture conversion failed: {rel}')
        row = json.loads(r.stdout)
        rows.append(row)
        if args.resume:
            cache.parent.mkdir(parents=True, exist_ok=True)
            temporary = cache.with_suffix('.json.tmp')
            try:
                temporary.write_text(json.dumps(row))
                temporary.replace(cache)
            finally:
                temporary.unlink(missing_ok=True)
    manifest = {'variant': args.variant, 'source_identity': VARIANTS[args.variant]['sourceIdentity'],
                'real_world_status': VARIANTS[args.variant]['realWorldStatus'],
                'repository': VARIANTS[args.variant].get('repository', DEFAULT_REPOSITORY),
                'revision': VARIANTS[args.variant].get('revision', DEFAULT_REV),
                'overrides': overrides, 'slots': slots,
                'unresolvedTextureOverrides': VARIANTS[args.variant].get('unresolvedTextureOverrides', {}),
                'textures': rows}
    tmp = target.with_suffix('.json.tmp')
    try:
        tmp.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
        tmp.replace(target)
    finally:
        tmp.unlink(missing_ok=True)
    print(f'Wrote {target}')


if __name__ == '__main__':
    main()
