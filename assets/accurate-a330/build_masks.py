"""Rasterise the unmodified a330-300-main.ac hull into the 323_blank.png UV space.

Writes derived/island-masks.npz: boolean masks of the texels covered by the
fuselage (incl. tail/nose cones, belly fairing, gear doors), the vertical fin
(incl. rudder) and each winglet, plus the affine UV->(x, y) fits quoted in
paint_core.ISLANDS. Run once; the liveries only need the masks.
"""
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
W, H = 2048, 1024


def parse_ac(path):
    lines = open(path, encoding='utf-8', errors='replace').read().replace('\r', '').split('\n')
    i = 1
    while lines[i].startswith('MATERIAL'):
        i += 1
    objs = []

    def obj(parent_loc, trail):
        nonlocal i
        while not lines[i].startswith('OBJECT'):
            i += 1
        i += 1
        name = ''; tex = None; loc = np.zeros(3); verts = []; faces = []
        while i < len(lines):
            l = lines[i].strip(); p = l.split(); k = p[0] if p else ''
            i += 1
            if k == 'name': name = l[6:-1]
            elif k == 'texture': tex = l[9:-1].split('/')[-1]
            elif k == 'loc': loc = np.array([float(x) for x in p[1:4]])
            elif k == 'data':
                n = int(p[1])
                while n > 0:
                    n -= len(lines[i]) + 1; i += 1
            elif k == 'numvert':
                for _ in range(int(p[1])):
                    verts.append([float(x) for x in lines[i].split()]); i += 1
            elif k == 'numsurf':
                for _ in range(int(p[1])):
                    while True:
                        s = lines[i].split(); i += 1
                        if s[0] == 'refs':
                            refs = []
                            for _ in range(int(s[1])):
                                r = lines[i].split(); i += 1
                                refs.append((int(r[0]), float(r[1]), float(r[2])))
                            faces.append(refs); break
            elif k == 'kids':
                n = int(p[1]); world = parent_loc + loc
                objs.append(dict(path=trail + [name], tex=tex, loc=world, verts=np.array(verts).reshape(-1, 3), faces=faces))
                for _ in range(n):
                    obj(world, trail + [name])
                return
    obj(np.zeros(3), [])
    return objs


def rasterize(selected):
    pos = np.full((H, W, 3), np.nan, np.float32)
    filled = np.zeros((H, W), bool)
    for o in selected:
        V = o['verts'] + o['loc']
        for refs in o['faces']:
            for k in range(1, len(refs) - 1):
                tri = [refs[0], refs[k], refs[k + 1]]
                P = np.array([V[r[0]] for r in tri])
                UV = np.array([[r[1] * W, (1 - r[2]) * H] for r in tri])
                x0, y0 = np.maximum(np.floor(UV.min(0)).astype(int), 0)
                x1, y1 = np.minimum(np.ceil(UV.max(0)).astype(int), (W - 1, H - 1))
                if x1 < x0 or y1 < y0: continue
                xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
                a, b, c = UV
                d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
                if abs(d) < 1e-9: continue
                l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
                l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
                l3 = 1 - l1 - l2
                m = (l1 >= -1e-4) & (l2 >= -1e-4) & (l3 >= -1e-4)
                if not m.any(): continue
                p = l1[..., None] * P[0] + l2[..., None] * P[1] + l3[..., None] * P[2]
                sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
                pos[sl][m] = p[m]; filled[sl][m] = True
    return pos, filled


def main():
    objs = parse_ac(HERE / 'Models' / 'a330-300-main.ac')
    sel = lambda names: [o for o in objs if o['tex'] == '323_blank.png' and o['path'][-1] in names]
    cats = {
        'body': sel(('fuselage', 'cylinder', 'bellyfairing', 'LeftGearDoor', 'RightGearDoor', 'NoseGearDoor.lf', 'NoseGearDoor.rf', 'NoseGearDoor.lr', 'NoseGearDoor.rr')),
        'fin': sel(('vstab', 'rudder')),
        'wl0': sel(('winglet0',)), 'wl1': sel(('winglet1',)),
    }
    out = {}
    for k, v in cats.items():
        _, filled = rasterize(v)
        out[k] = filled
        print(k, int(filled.sum()))
    (HERE / 'derived').mkdir(exist_ok=True)
    np.savez_compressed(HERE / 'derived' / 'island-masks.npz', **out)


if __name__ == '__main__':
    main()
