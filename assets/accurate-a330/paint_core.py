"""Side-profile livery painter for the FlightGear A330-300 UV atlas (323_blank.png).

The 2048x1024 atlas is an orthographic side-view unwrap: the upper-left island
is the starboard side (nose right, tail left) and the lower island is the port
side (nose left). Every texel therefore corresponds to a real (x, y) position on
the airframe, and the mapping is affine (verified to 0.000 m error against the
unmodified a330-300-main.ac hull). Liveries are drawn once per side as ordinary
side-view artwork in metres and resampled into the atlas through that mapping,
then multiplied over the untouched upstream atlas so panel lines, doors and
windows survive.

Only original vector drawing and fonts are used here; no photographs.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageChops

HERE = Path(__file__).resolve().parent
MODELS = HERE / 'Models'
W, H = 2048, 1024
PPM = 128                      # drawing resolution, pixels per metre
PPM_SAMPLE = PPM // 2          # resampled to ~2x the atlas texel density
XMIN, XMAX, YMIN, YMAX = -27.0, 38.0, -4.5, 13.0
NOSE_X = -25.53                # AC x of the nose tip; s = x - NOSE_X is distance aft of the nose
FONT_DIR = Path('C:/Windows/Fonts')
FONTS = {
    'sans': 'arial.ttf', 'sansb': 'arialbd.ttf', 'sansbi': 'arialbi.ttf', 'sansi': 'ariali.ttf', 'black': 'ariblk.ttf',
    'serif': 'times.ttf', 'serifb': 'timesbd.ttf', 'georgiab': 'georgiab.ttf', 'georgia': 'georgia.ttf',
    'cjk': 'msyhbd.ttc', 'cjkr': 'msyh.ttc', 'uni': 'ARIALUNI.TTF', 'narrowb': 'ARIALNB.TTF', 'bahn': 'bahnschrift.ttf',
    'segoeb': 'segoeuib.ttf', 'trebucb': 'trebucbd.ttf', 'verdanab': 'verdanab.ttf', 'tahomab': 'tahomabd.ttf',
    'frutiger': 'calibrib.ttf', 'gill': 'GILB____.TTF',
}


def font(name, size):
    return ImageFont.truetype(str(FONT_DIR / FONTS.get(name, name)), max(1, int(round(size))))


def rgb(c):
    if isinstance(c, str):
        c = c.lstrip('#')
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    return tuple(c[:3])


# ----------------------------------------------------------------------------
# Island geometry, fitted from the hull (see module docstring).
# px/py are *continuous canvas coordinates at PPM_SAMPLE* for texel index (col,row).
# ----------------------------------------------------------------------------
# x = ax*col + bx, y = ay*row + by   (AC world metres)
ISLANDS = {
    'fuse_s': dict(ax=-0.03082, bx=37.383, ay=-0.03161, by=13.691, port=False),
    'fuse_p': dict(ax=0.03080, bx=-25.617, ay=-0.03170, by=29.118, port=True),
    'fin_s': dict(ax=-0.03130, bx=37.570, ay=-0.02912, by=12.764, port=False),
    'fin_p': dict(ax=0.03109, bx=-25.988, ay=-0.02887, by=26.723, port=True),
}


class Side:
    """A drawing surface in side-view metres. port=False: starboard (nose to the right)."""

    def __init__(self, port, base=(250, 250, 248)):
        self.port = port
        self.size = (int((XMAX - XMIN) * PPM), int((YMAX - YMIN) * PPM))
        self.img = Image.new('RGB', self.size, rgb(base))
        self.d = ImageDraw.Draw(self.img)

    # coordinates: s = metres aft of the nose tip, y = metres (AC world y)
    def px(self, s):
        x = s + NOSE_X
        return ((x - XMIN) if self.port else (XMAX - x)) * PPM

    def py(self, y):
        return (YMAX - y) * PPM

    def P(self, pts):
        return [(self.px(s), self.py(y)) for s, y in pts]

    def poly(self, pts, fill, ymin=None, ymax=None):
        if ymin is None and ymax is None:
            self.d.polygon(self.P(pts), fill=rgb(fill))
            return
        mask = Image.new('L', self.size, 0)
        ImageDraw.Draw(mask).polygon(self.P(pts), fill=255)
        clip = Image.new('L', self.size, 255)
        cd = ImageDraw.Draw(clip)
        if ymin is not None:
            cd.rectangle((0, self.py(ymin), self.size[0], self.size[1]), fill=0)
        if ymax is not None:
            cd.rectangle((0, 0, self.size[0], self.py(ymax)), fill=0)
        self.img.paste(Image.new('RGB', self.size, rgb(fill)), (0, 0), ImageChops.multiply(mask, clip))

    def mir(self, s0, s1, pivot):
        """Stations for text that must read left-to-right on both sides: the port side mirrors the starboard layout about pivot."""
        if not self.port:
            return s0, s1
        return 2 * pivot - s1, 2 * pivot - s0

    def rect(self, s0, s1, y0, y1, fill):
        self.poly([(s0, y0), (s1, y0), (s1, y1), (s0, y1)], fill)

    def band(self, top, bottom, fill, s0=-5.0, s1=70.0, steps=40):
        """Filled band between two curves y=top(s) and y=bottom(s)."""
        ss = [s0 + (s1 - s0) * i / steps for i in range(steps + 1)]
        self.poly([(s, top(s)) for s in ss] + [(s, bottom(s)) for s in reversed(ss)], fill)

    def line(self, pts, fill, width_m):
        self.d.line(self.P(pts), fill=rgb(fill), width=max(1, int(round(width_m * PPM))), joint='curve')

    def ellipse(self, s, y, rs, ry, fill):
        cx, cy = self.px(s), self.py(y)
        self.d.ellipse((cx - rs * PPM, cy - ry * PPM, cx + rs * PPM, cy + ry * PPM), fill=rgb(fill))

    # ---- text / images -------------------------------------------------------
    def _paste_rgba(self, layer, cx, cy):
        self.img.paste(layer.convert('RGB'), (int(round(cx - layer.width / 2)), int(round(cy - layer.height / 2))), layer.getchannel('A'))

    def text(self, s0, s1, y, string, face, fill, cap_m, tracking=0.0, stretch=None, italic_shear=0.0):
        """Draw upright text centred on y between nose-side/tail-side stations s0<s1.

        cap_m is the cap height in metres. stretch=True forces the glyph run to fill s0..s1
        exactly; otherwise it is only squeezed if it would overflow.
        """
        size = cap_m * PPM / 0.72
        f = font(face, size)
        chars = list(string)
        widths = [self.d.textlength(ch, font=f) for ch in chars]
        track = tracking * size
        total = sum(widths) + track * (len(chars) - 1)
        b = self.d.textbbox((0, 0), string.replace(' ', 'x') if string.strip() else 'x', font=f)
        h = b[3] - b[1]
        layer = Image.new('L', (int(total + 8), int(h + 8)), 0)
        ld = ImageDraw.Draw(layer)
        x = 4
        for ch, w in zip(chars, widths):
            ld.text((x, 4 - b[1]), ch, font=f, fill=255)
            x += w + track
        target = abs(self.px(s1) - self.px(s0))
        if stretch or (stretch is None and total > target):
            layer = layer.resize((max(1, int(target)), layer.height), Image.LANCZOS)
        if italic_shear:
            layer = layer.transform(layer.size, Image.AFFINE, (1, italic_shear, -italic_shear * layer.height / 2, 0, 1, 0), Image.BICUBIC)
        cx = (self.px(s0) + self.px(s1)) / 2
        self._paste_mask(layer, cx, self.py(y), fill)

    def text_multi(self, s0, s1, y, parts, face, cap_m, tracking=0.0):
        """Several coloured runs drawn left-to-right; parts = [(string, colour), ...] and the whole run fits s0..s1."""
        size = cap_m * PPM / 0.72
        f = font(face, size)
        widths = [self.d.textlength(t, font=f) + tracking * size * len(t) for t, _ in parts]
        b = self.d.textbbox((0, 0), 'Hx', font=f)
        h = b[3] - b[1]
        total = sum(widths)
        layer = Image.new('RGBA', (int(total + 8), int(h + 8)), (0, 0, 0, 0))
        x = 4
        for (t, col), w in zip(parts, widths):
            m = Image.new('L', layer.size, 0)
            ImageDraw.Draw(m).text((x, 4 - b[1]), t, font=f, fill=255)
            layer.paste(Image.new('RGBA', layer.size, rgb(col) + (255,)), (0, 0), m)
            x += w
        bbox = layer.getchannel('A').getbbox()
        layer = layer.crop(bbox)
        target = abs(self.px(s1) - self.px(s0))
        if layer.width > target:
            layer = layer.resize((max(1, int(target)), layer.height), Image.LANCZOS)
        cx = (self.px(s0) + self.px(s1)) / 2
        self.img.paste(layer.convert('RGB'), (int(round(cx - layer.width / 2)), int(round(self.py(y) - layer.height / 2))), layer.getchannel('A'))

    def _paste_mask(self, mask, cx, cy, fill):
        col = Image.new('RGB', mask.size, rgb(fill))
        self.img.paste(col, (int(round(cx - mask.width / 2)), int(round(cy - mask.height / 2))), mask)

    def logo(self, path, s, y, height_m, color=None, flip=False, rot=0.0, width_m=None, threshold=None):
        im = Image.open(path).convert('RGBA')
        bbox = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
        im = im.crop(bbox)
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        h = height_m * PPM
        w = width_m * PPM if width_m else im.width * h / im.height
        im = im.resize((max(1, int(w)), max(1, int(h))), Image.LANCZOS)
        if rot:
            im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
        if color is not None:
            mask = im.getchannel('A')
            if threshold is not None:  # use luminance as the mask (e.g. white calligraphy on red)
                lum = im.convert('L').point(lambda v: 255 if v > threshold else 0)
                mask = ImageChops.multiply(lum, mask)
            col = Image.new('RGB', im.size, rgb(color))
            self.img.paste(col, (int(round(self.px(s) - im.width / 2)), int(round(self.py(y) - im.height / 2))), mask)
        else:
            self.img.paste(im.convert('RGB'), (int(round(self.px(s) - im.width / 2)), int(round(self.py(y) - im.height / 2))), im.getchannel('A'))

    def small(self):
        return self.img.resize((self.size[0] * PPM_SAMPLE // PPM, self.size[1] * PPM_SAMPLE // PPM), Image.BOX)


def resample(side_img_small, island):
    g = ISLANDS[island]
    k = PPM_SAMPLE
    if g['port']:
        A, B = g['ax'] * k, (g['bx'] - XMIN) * k
    else:
        A, B = -g['ax'] * k, (XMAX - g['bx']) * k
    C, D = -g['ay'] * k, (YMAX - g['by']) * k
    return side_img_small.transform((W, H), Image.AFFINE, (A, 0, B - A * 0.5, 0, C, D - C * 0.5), resample=Image.BICUBIC)


# ----------------------------------------------------------------------------
# Island masks (precomputed from the AC hull by tools in this folder: see build_masks)
# ----------------------------------------------------------------------------
def _fit(pos, filled, r0, r1, c0, c1, zsign=None):
    ys, xs = np.where(filled[r0:r1, c0:c1])
    ys += r0
    xs += c0
    P = pos[ys, xs]
    if zsign is not None:
        m = np.sign(P[:, 2]) == zsign
        ys, xs, P = ys[m], xs[m], P[m]
    ax, bx = np.polyfit(xs, P[:, 0], 1)
    ay, by = np.polyfit(ys, P[:, 1], 1)
    return dict(ax=float(ax), bx=float(bx), ay=float(ay), by=float(by))


def load_masks():
    z = np.load(HERE / 'derived' / 'island-masks.npz')
    return {k: z[k] for k in z.files}


def dilate(mask, n):
    m = mask.copy()
    for _ in range(n):
        p = np.pad(m, 1)
        m = m | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    return m


def bleed(rgb_img, mask, n=10):
    """Extend painted colours n texels beyond the island edge so mip-mapping never pulls in black."""
    a = np.array(rgb_img).astype(np.float32)
    known = mask.copy()
    for _ in range(n):
        acc = np.zeros_like(a)
        cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(a, dy, 0), dx, 1)
            sk = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += sh * sk[..., None]
            cnt += sk
        fill = (~known) & (cnt > 0)
        a[fill] = acc[fill] / cnt[fill][..., None]
        known = known | fill
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


class Atlas:
    """Collects per-island art, composites over the base atlas and writes the PNG."""

    def __init__(self, base_path):
        self.base = Image.open(base_path).convert('RGB')
        self.masks = load_masks()
        self.paint = self.base.copy()   # starts as plain base; islands get replaced by painted+multiplied result

    def apply_sides(self, stbd: Side, port: Side, fin_stbd: Side = None, fin_port: Side = None):
        fin_stbd = fin_stbd or stbd
        fin_port = fin_port or port
        sm, pm, fsm, fpm = stbd.small(), port.small(), (fin_stbd.small() if fin_stbd is not stbd else None), (fin_port.small() if fin_port is not port else None)
        m = self.masks
        top = np.zeros((H, W), bool)
        top[:560, :] = True
        left = np.zeros((H, W), bool)
        left[:, :1050] = True
        regions = {
            'fuse_s': m['body'] & top,
            'fuse_p': m['body'] & ~top,
            'fin_s': m['fin'] & top & left[:, :] & (np.arange(W)[None, :] < 450),
            'fin_p': m['fin'] & ~top & (np.arange(W)[None, :] > 1550),
        }
        arts = {'fuse_s': sm, 'fuse_p': pm, 'fin_s': fsm or sm, 'fin_p': fpm or pm}
        out = np.array(self.base).astype(np.float32)
        base = out.copy()
        for name, region in regions.items():
            sampled = np.array(resample(arts[name], name)).astype(np.float32)
            reg = dilate(region, 3)
            # bleed paint into the 3 texel gutter, then keep the base's own details by multiplying
            out[reg] = (sampled[reg] / 255.0) * base[reg]
        self.paint = Image.fromarray(out.clip(0, 255).astype(np.uint8))
        self.island_union = dilate(regions['fuse_s'] | regions['fuse_p'] | regions['fin_s'] | regions['fin_p'], 3)
        self.out = out
        self.base_arr = base
        return self

    def winglets(self, colour=None, emblem=None):
        """Fill both winglet pairs with a solid colour (multiplied over the base) and optionally centre an emblem on each face."""
        m = self.masks
        reg = dilate(m['wl0'] | m['wl1'], 3)
        out = self.out
        if colour is not None:
            out[reg] = (np.array(rgb(colour), np.float32) / 255.0) * self.base_arr[reg]
        self.paint = Image.fromarray(out.clip(0, 255).astype(np.uint8))
        if emblem is not None:
            self.paint = emblem(self.paint, self.base_arr)
        self.island_union = self.island_union | reg
        return self

    def finish(self):
        """Bleed painted colours a few texels past every island edge so mip-mapping never pulls in the black background."""
        a = np.array(self.base).sum(axis=2)
        known = (a > 30) | self.island_union
        # untouched base content (e.g. wing/pylon panels) keeps its own bleed; only extend painted islands
        self.paint = bleed(self.paint, known, 6)
        return self.paint

    def save(self, path, extra=None):
        self.finish().save(path, optimize=True)
