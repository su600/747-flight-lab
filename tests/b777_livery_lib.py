"""Shared helpers for the 777 livery generators.

Pipeline: GLB triangles -> UV rasterisation -> per-texel hull position ->
lookup in orthographic side-view artwork (SVG rendered by resvg) -> multiplied
onto the neutral FlightGear atlas. All artwork is original vector drawing.
"""
import hashlib, json, os, struct, subprocess, tempfile
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GLB = {
 'pax': ROOT/'assets/accurate-b777/777-200LR-2048.candidate.glb',
 'cargo': ROOT/'assets/accurate-b777/777-200F-refined.candidate.glb',
}
SRC = ROOT/'assets/accurate-b777'
CACHE = Path(os.environ.get('B777_CACHE', tempfile.gettempdir()))/'b777-livery-cache'
CACHE.mkdir(parents=True, exist_ok=True)

_TYPES = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
_COLS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def _quat(q):
    x, y, z, w = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w), 0], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w), 0],
                     [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y), 0], [0, 0, 0, 1]])


def _node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix']).reshape(4, 4).T
    t = np.eye(4)
    t[:3, 3] = n.get('translation', [0, 0, 0])
    return t@_quat(n.get('rotation', [0, 0, 0, 1]))@np.diag([*n.get('scale', [1, 1, 1]), 1])


def load_prims(variant):
    data = GLB[variant].read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20+size])
    base = 20+size+8

    def access(i):
        a = gltf['accessors'][i]
        v = gltf['bufferViews'][a['bufferView']]
        dt = np.dtype(_TYPES[a['componentType']])
        c = _COLS[a['type']]
        return np.ndarray((a['count'], c), dtype=dt, buffer=data, offset=base+v.get('byteOffset', 0)+a.get('byteOffset', 0),
                          strides=(v.get('byteStride', dt.itemsize*c), dt.itemsize))
    out = []

    def walk(i, parent):
        n = gltf['nodes'][i]
        m = parent@_node_matrix(n)
        name = n.get('extras', {}).get('fgName', n.get('name', ''))
        if 'mesh' in n:
            for p in gltf['meshes'][n['mesh']]['primitives']:
                if 'TEXCOORD_0' not in p['attributes'] or 'indices' not in p:
                    continue
                mat = gltf['materials'][p['material']]
                pos = np.array(access(p['attributes']['POSITION']), dtype=np.float64)
                out.append(dict(name=name, src=mat.get('extras', {}).get('sourceTexture'),
                                pos=(m@np.c_[pos, np.ones(len(pos))].T).T[:, :3],
                                uv=np.array(access(p['attributes']['TEXCOORD_0']), dtype=np.float64),
                                idx=np.array(access(p['indices'])).reshape(-1, 3)))
        for c in n.get('children', []):
            walk(c, m)
    for s in gltf['scenes'][0]['nodes']:
        walk(s, np.eye(4))
    return out


def raster_positions(prims, source, n, include=None, exclude=None, bleed_px=5, tag=''):
    """Map every covered texel of atlas `source` to its 3D hull position (cached)."""
    ident = repr((source, n, sorted(include or []), sorted(exclude or []), len(prims), sum(len(p['idx']) for p in prims), tag))
    key = CACHE/(hashlib.sha1(ident.encode()).hexdigest()[:16]+'.npz')
    if key.exists():
        z = np.load(key)
        return z['pos'], z['mask']
    pos = np.zeros((n, n, 3), np.float32)
    mask = np.zeros((n, n), np.uint8)
    for p in prims:
        if p['src'] != source:
            continue
        if include and p['name'] not in include:
            continue
        if exclude and p['name'] in exclude:
            continue
        px = p['uv'][:, 0]*n-.5
        py = p['uv'][:, 1]*n-.5
        for a, b, c in p['idx']:
            xs = px[[a, b, c]]
            ys = py[[a, b, c]]
            x0 = max(int(np.floor(xs.min())), 0)
            x1 = min(int(np.ceil(xs.max())), n-1)
            y0 = max(int(np.floor(ys.min())), 0)
            y1 = min(int(np.ceil(ys.max())), n-1)
            if x1 < x0 or y1 < y0:
                continue
            den = (ys[1]-ys[2])*(xs[0]-xs[2])+(xs[2]-xs[1])*(ys[0]-ys[2])
            if abs(den) < 1e-9:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1+1), np.arange(y0, y1+1))
            l0 = ((ys[1]-ys[2])*(gx-xs[2])+(xs[2]-xs[1])*(gy-ys[2]))/den
            l1 = ((ys[2]-ys[0])*(gx-xs[2])+(xs[0]-xs[2])*(gy-ys[2]))/den
            m = (l0 >= -.02) & (l1 >= -.02) & ((1-l0-l1) >= -.02)
            if not m.any():
                continue
            w = np.stack([l0[m], l1[m], 1-l0[m]-l1[m]], 1)
            pos[gy[m], gx[m]] = w@p['pos'][[a, b, c]]
            mask[gy[m], gx[m]] = 255
    # extend into neighbouring texels so UV-island borders never show the neutral base
    covered = mask > 0
    dist, lab = cv2.distanceTransformWithLabels((~covered).astype(np.uint8), cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
    zy, zx = np.nonzero(covered)
    ly = np.zeros(lab.max()+1, np.int32)
    lx = np.zeros_like(ly)
    ly[lab[zy, zx]] = zy
    lx[lab[zy, zx]] = zx
    near = (~covered) & (dist <= bleed_px)
    pos[near] = pos[ly[lab[near]], lx[lab[near]]]
    mask[near] = 255
    np.savez(key, pos=pos, mask=mask)
    return pos, mask


class SideCanvas:
    """Orthographic side view. u = x for the port (+z) side, -x for starboard; v = ytop - y."""
    def __init__(self, image, u0, ytop, ppm):
        self.img = np.asarray(image.convert('RGBA'), np.float32)/255
        self.u0, self.ytop, self.ppm = u0, ytop, ppm

    def sample(self, u, y):
        mx = ((u-self.u0)*self.ppm-.5).astype(np.float32)
        my = ((self.ytop-y)*self.ppm-.5).astype(np.float32)
        return cv2.remap(self.img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def render_svg(svg_text, width):
    with tempfile.TemporaryDirectory() as d:
        s = Path(d)/'a.svg'
        o = Path(d)/'a.png'
        s.write_text(svg_text, encoding='utf-8')
        subprocess.run(['node', str(ROOT/'tests/b777_render_svg.mjs'), str(s), str(o), str(width)], check=True)
        return Image.open(o).convert('RGBA')


def luma(rgb):
    return rgb[..., 0]*.2126+rgb[..., 1]*.7152+rgb[..., 2]*.0722


def paint(base_rgb, pos, mask, port, stbd):
    """base_rgb float (n,n,3) in 0..1; returns the painted copy. port/stbd are SideCanvas."""
    x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
    art = np.where((z >= 0)[..., None], port.sample(x, y), stbd.sample(-x, y))
    # keep dark interior/mechanical details on shared atlases: tint only the bright exterior skin
    w = np.clip((luma(base_rgb)-.70)/.18, 0, 1)[..., None]*art[..., 3:4]*(mask > 0)[..., None]
    return base_rgb*(1-w)+base_rgb*art[..., :3]*w


def load_rgb(path, n):
    im = Image.open(path).convert('RGB')
    if im.size != (n, n):
        im = im.resize((n, n), Image.Resampling.LANCZOS)
    return np.asarray(im, np.float32)/255


def save_webp(arr, path, quality=90):
    Image.fromarray(np.clip(arr*255+.5, 0, 255).astype(np.uint8)).save(path, 'WEBP', quality=quality, method=4)
